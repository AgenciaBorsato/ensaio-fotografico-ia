import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { replicate, REPLICATE_VERSIONS } from '@/lib/replicate'
import { scoreFaceSimilarity, isFaceScoringAvailable } from '@/lib/face-scoring'
import { r2Client, getPresignedDownloadUrl, getPublicProxyUrl } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const BATCH_SIZE = 1  // Processar 1 por vez para evitar rate limit
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ensaio-studio'

async function persistToR2(url: string, ensaioId: string, photoId: string, suffix: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const key = `ensaios/${ensaioId}/generated/${photoId}-${suffix}.png`
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }))
  return getPublicProxyUrl(key)
}

// POST /api/ensaios/[id]/generate — gerar fotos
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ensaioId } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id: ensaioId },
    include: { loraModel: true, referencePhotos: { orderBy: { order: 'asc' } } },
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

    // Buscar versao do modelo treinado no Replicate
    const username = process.env.REPLICATE_USERNAME || 'studio'
    const modelName = triggerWord.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const trainedModel = `${username}/${modelName}`
    console.log(`[Generate] Buscando modelo treinado: ${trainedModel}`)

    const modelInfo = await replicate.models.get(username, modelName)
    const trainedVersion = modelInfo.latest_version?.id
    if (!trainedVersion) throw new Error(`Modelo ${trainedModel} nao tem versao disponivel`)
    console.log(`[Generate] Usando versao: ${trainedVersion}`)

    // Preparar URL da melhor foto de referencia para face swap
    // Usa a primeira foto (geralmente a melhor, frontal)
    const bestRefPhoto = ensaio.referencePhotos[0]
    const refPhotoUrl = bestRefPhoto ? getPublicProxyUrl(bestRefPhoto.photoUrl) : null
    console.log(`[Generate] Face swap ref: ${refPhotoUrl ? 'disponivel' : 'nao disponivel'}`)

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
          const fullPrompt = `a photo of ${triggerWord}, ${promptText}${inspirationContext}, maintaining exact facial features of ${triggerWord}`

          const generatedPhoto = await db.generatedPhoto.create({
            data: {
              ensaioId,
              prompt: promptText,
              status: 'generating',
              seed: Math.floor(Math.random() * 2147483647),
            },
          })

          try {
            // 1. Gerar com modelo treinado (FLUX + LoRA)
            const rawUrl = await runPredictionByVersion(trainedVersion, {
              prompt: fullPrompt,
              num_outputs: 1,
              aspect_ratio: '3:4',
              output_format: 'png',
              guidance_scale: 4.5,
              output_quality: 95,
              num_inference_steps: 30,
              seed: generatedPhoto.seed,
            })

            if (!rawUrl) throw new Error('Geracao falhou')

            // Persistir raw no R2
            const rawR2Url = await persistToR2(rawUrl, ensaioId, generatedPhoto.id, 'raw')
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { rawUrl: rawR2Url, status: 'face_swapping' },
            })

            // Delay para evitar rate limit (credito < $5 = max 6 req/min)
            await new Promise((r) => setTimeout(r, 12000))

            // 2. Face Swap — troca o rosto pela foto de referencia real
            let imageForUpscale = rawUrl
            if (refPhotoUrl) {
              console.log(`[Generate] Face swap para ${generatedPhoto.id}...`)
              try {
                const swappedUrl = await runPredictionByVersion(REPLICATE_VERSIONS.FACE_SWAP, {
                  source_image: refPhotoUrl,
                  target_image: rawUrl,
                })
                if (swappedUrl) {
                  imageForUpscale = swappedUrl
                  const swappedR2Url = await persistToR2(swappedUrl, ensaioId, generatedPhoto.id, 'swapped')
                  await db.generatedPhoto.update({
                    where: { id: generatedPhoto.id },
                    data: { rawUrl: swappedR2Url },
                  })
                  console.log(`[Generate] Face swap OK para ${generatedPhoto.id}`)
                }
              } catch (swapErr: any) {
                console.error(`[Generate] Face swap falhou para ${generatedPhoto.id}:`, swapErr.message)
                // Continua com a imagem raw se o face swap falhar
              }
            }

            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { status: 'upscaling' },
            })

            // 3. Upscale com Real-ESRGAN
            const upscaledReplicateUrl = await runPredictionByVersion(REPLICATE_VERSIONS.REAL_ESRGAN, {
              image: imageForUpscale,
              scale: 4,
              face_enhance: true,
            }) || imageForUpscale

            const upscaledUrl = await persistToR2(upscaledReplicateUrl, ensaioId, generatedPhoto.id, 'upscaled')
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { upscaledUrl, status: 'restoring' },
            })

            // 4. Restauracao facial com CodeFormer
            const restoredReplicateUrl = await runPredictionByVersion(REPLICATE_VERSIONS.CODEFORMER, {
              image: upscaledReplicateUrl,
              upscale: 2,
              face_upsample: true,
              codeformer_fidelity: 0.7,
            }) || upscaledReplicateUrl

            const restoredUrl = await persistToR2(restoredReplicateUrl, ensaioId, generatedPhoto.id, 'restored')
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { restoredUrl, status: 'scoring' },
            })

            // 5. Face scoring (se disponivel)
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
