import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { replicate, REPLICATE_VERSIONS } from '@/lib/replicate'
import { scoreFaceSimilarity, isFaceScoringAvailable } from '@/lib/face-scoring'
import { getPresignedDownloadUrl } from '@/lib/r2'

const BATCH_SIZE = 3

// POST /api/ensaios/[id]/generate — gerar fotos
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ensaioId } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id: ensaioId },
    include: { loraModel: true },
  })

  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  if (!ensaio.loraModel || ensaio.loraModel.status !== 'completed') {
    return NextResponse.json({ error: 'Treine a IA primeiro' }, { status: 400 })
  }
  if (ensaio.prompts.length === 0) {
    return NextResponse.json({ error: 'Adicione pelo menos um prompt' }, { status: 400 })
  }

  await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'generating' } })

  // Disparar geracao em background
  runGeneration(ensaioId, ensaio).catch(console.error)

  return NextResponse.json({ status: 'generating' })
}

async function runGeneration(ensaioId: string, ensaio: any) {
  try {
    const triggerWord = ensaio.loraModel.triggerWord
    const inspirationContext = ensaio.inspirationPhotoUrl ? ', inspired by the reference style and mood' : ''

    // Usar o modelo treinado diretamente no Replicate
    const username = process.env.REPLICATE_USERNAME || 'studio'
    const modelName = triggerWord.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const trainedModel = `${username}/${modelName}`
    console.log(`[Generate] Usando modelo treinado: ${trainedModel}`)

    // Expandir prompts
    const allPrompts: string[] = []
    for (const prompt of ensaio.prompts) {
      for (let j = 0; j < ensaio.photosPerPrompt; j++) {
        allPrompts.push(prompt)
      }
    }

    for (let i = 0; i < allPrompts.length; i += BATCH_SIZE) {
      const batch = allPrompts.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (promptText) => {
          const fullPrompt = `${promptText}, photo of ${triggerWord}${inspirationContext}, professional photography, high quality, detailed face, sharp focus, 8k`

          const generatedPhoto = await db.generatedPhoto.create({
            data: {
              ensaioId,
              prompt: promptText,
              status: 'generating',
              seed: Math.floor(Math.random() * 2147483647),
            },
          })

          try {
            // 1. Gerar com modelo treinado (FLUX + LoRA integrado)
            const rawUrl = await runPrediction(trainedModel, {
              prompt: fullPrompt,
              num_outputs: 1,
              aspect_ratio: '3:4',
              output_format: 'png',
              guidance_scale: 3.5,
              output_quality: 95,
              num_inference_steps: 28,
              seed: generatedPhoto.seed,
            })

            if (!rawUrl) throw new Error('Geracao falhou')

            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { rawUrl, status: 'upscaling' },
            })

            // 2. Upscale com Real-ESRGAN
            const upscaledUrl = await runPredictionByVersion(REPLICATE_VERSIONS.REAL_ESRGAN, {
              image: rawUrl,
              scale: 4,
              face_enhance: true,
            }) || rawUrl

            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { upscaledUrl, status: 'restoring' },
            })

            // 3. Restauracao facial com CodeFormer
            const restoredUrl = await runPredictionByVersion(REPLICATE_VERSIONS.CODEFORMER, {
              image: upscaledUrl,
              upscale: 2,
              face_upsample: true,
              codeformer_fidelity: 0.7,
            }) || upscaledUrl

            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { restoredUrl, status: 'scoring' },
            })

            // 4. Face scoring (se disponivel)
            try {
              const scoringAvailable = await isFaceScoringAvailable()
              if (scoringAvailable) {
                const refs = await db.referencePhoto.findMany({ where: { ensaioId } })
                const refUrls = await Promise.all(refs.map(r => getPresignedDownloadUrl(r.photoUrl)))
                const scoreResult = await scoreFaceSimilarity(restoredUrl, refUrls)

                await db.generatedPhoto.update({
                  where: { id: generatedPhoto.id },
                  data: { similarityScore: scoreResult.score, status: 'pending_review' },
                })
              } else {
                await db.generatedPhoto.update({
                  where: { id: generatedPhoto.id },
                  data: { status: 'pending_review' },
                })
              }
            } catch {
              await db.generatedPhoto.update({
                where: { id: generatedPhoto.id },
                data: { status: 'pending_review' },
              })
            }
          } catch (error: any) {
            console.error(`[Generate Error] ${generatedPhoto.id}:`, error.message)
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { status: 'rejected', notes: error.message },
            })
          }
        })
      )
    }

    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'completed' } })
  } catch (error: any) {
    console.error('[Generate Error]', error)
    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'trained' } })
  }
}

async function runPrediction(model: string, input: Record<string, any>): Promise<string | null> {
  const prediction = await replicate.predictions.create({ model, input })
  return pollPrediction(prediction.id)
}

async function runPredictionByVersion(version: string, input: Record<string, any>): Promise<string | null> {
  const prediction = await replicate.predictions.create({ version, input })
  return pollPrediction(prediction.id)
}

async function pollPrediction(predictionId: string): Promise<string | null> {
  let result = await replicate.predictions.get(predictionId)
  let pollCount = 0

  while (result.status !== 'succeeded' && result.status !== 'failed' && pollCount < 120) {
    await new Promise((r) => setTimeout(r, 3000))
    result = await replicate.predictions.get(predictionId)
    pollCount++
  }

  if (result.status !== 'succeeded') return null
  return typeof result.output === 'string' ? result.output : (result.output as any)?.[0] || null
}

export const maxDuration = 300
export const dynamic = 'force-dynamic'
