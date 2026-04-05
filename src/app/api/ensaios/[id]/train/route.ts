import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { replicate } from '@/lib/replicate'
import { r2Client, getPublicProxyUrl } from '@/lib/r2'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import JSZip from 'jszip'

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ensaio-studio'

// POST /api/ensaios/[id]/train — treinar LoRA (roda em background)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ensaioId } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id: ensaioId },
    include: { referencePhotos: { orderBy: { order: 'asc' } }, loraModel: true },
  })

  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  if (ensaio.referencePhotos.length === 0) {
    return NextResponse.json({ error: 'Envie fotos de referencia primeiro' }, { status: 400 })
  }
  if (ensaio.loraModel?.status === 'completed') {
    return NextResponse.json({ message: 'LoRA ja treinado' })
  }
  if (ensaio.loraModel?.status === 'processing') {
    return NextResponse.json({ message: 'Treino ja em andamento' })
  }

  const triggerWord = `ENSAIO_${ensaioId.slice(0, 8).toUpperCase()}`

  // Criar/atualizar registro do LoRA
  const loraModel = await db.loraModel.upsert({
    where: { ensaioId },
    create: { ensaioId, triggerWord, status: 'processing' },
    update: { status: 'processing', progress: 0, errorMessage: null },
  })

  await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'training' } })

  // Disparar treino em background (nao bloqueia a resposta)
  runTraining(ensaioId, loraModel.id, ensaio.referencePhotos, triggerWord).catch(console.error)

  return NextResponse.json({ status: 'training_started', loraModelId: loraModel.id })
}

async function runTraining(
  ensaioId: string,
  loraModelId: string,
  referencePhotos: { photoUrl: string }[],
  triggerWord: string
) {
  try {
    // 1. Baixar fotos do R2 e criar ZIP
    console.log(`[Train] Criando ZIP com ${referencePhotos.length} fotos...`)
    const zip = new JSZip()

    for (let i = 0; i < referencePhotos.length; i++) {
      const key = referencePhotos[i].photoUrl
      const ext = key.split('.').pop()?.toLowerCase() || 'jpg'
      const response = await r2Client.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }))
      if (!response.Body) throw new Error(`Foto nao encontrada no R2: ${key}`)
      const bytes = await response.Body.transformToByteArray()
      zip.file(`photo_${i + 1}.${ext}`, bytes)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    console.log(`[Train] ZIP criado: ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB`)

    // 2. Upload ZIP para R2
    const zipKey = `ensaios/${ensaioId}/lora/training-images.zip`
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: zipKey,
      Body: zipBuffer,
      ContentType: 'application/zip',
    }))

    // 3. Gerar URL publica do ZIP via proxy
    const zipUrl = getPublicProxyUrl(zipKey)
    console.log(`[Train] ZIP disponivel via proxy`)

    // 4. Buscar versao mais recente do modelo
    const trainerModel = await replicate.models.get('ostris', 'flux-dev-lora-trainer')
    const latestVersion = trainerModel.latest_version?.id
    if (!latestVersion) throw new Error('Versao do modelo nao encontrada')

    const username = process.env.REPLICATE_USERNAME || 'studio'
    const modelName = triggerWord.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const destination = `${username}/${modelName}`

    // 5. Criar modelo de destino no Replicate (se nao existir)
    try {
      await replicate.models.get(username, modelName)
    } catch {
      await replicate.models.create(username, modelName, {
        visibility: 'private',
        hardware: 'gpu-t4',
        description: `LoRA model for ensaio ${ensaioId}`,
      })
    }

    // 6. Iniciar treino com URL do ZIP
    const training = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      latestVersion,
      {
        destination: destination as `${string}/${string}`,
        input: {
          input_images: zipUrl,
          trigger_word: triggerWord,
          steps: 1000,
          learning_rate: 0.0004,
          lora_rank: 16,
          resolution: '1024',
          autocaption: true,
        },
      }
    )

    console.log(`[Train] Treino iniciado: ${training.id}`)

    await db.loraModel.update({
      where: { id: loraModelId },
      data: { replicateTrainingId: training.id, progress: 10 },
    })

    // Polling ate concluir
    let result = training
    let pollCount = 0
    const maxPolls = 180

    while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled' && pollCount < maxPolls) {
      await new Promise((r) => setTimeout(r, 10000))
      result = await replicate.trainings.get(training.id)
      pollCount++
      await db.loraModel.update({
        where: { id: loraModelId },
        data: { progress: Math.min(10 + Math.floor((pollCount / maxPolls) * 80), 90) },
      })
    }

    if (result.status !== 'succeeded') {
      throw new Error(`Treino ${result.status}: ${result.error || 'Erro desconhecido'}`)
    }

    const loraUrl = (result.output as any)?.weights || (result.output as any)?.version
    const modelUrl = (result as any).model

    await db.loraModel.update({
      where: { id: loraModelId },
      data: {
        status: 'completed',
        progress: 100,
        loraUrl: typeof loraUrl === 'string' ? loraUrl : JSON.stringify(loraUrl),
        replicateModelUrl: typeof modelUrl === 'string' ? modelUrl : undefined,
        completedAt: new Date(),
      },
    })

    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'trained' } })
    console.log(`[Train] Treino concluido com sucesso!`)
  } catch (error: any) {
    console.error('[Train Error]', error)
    await db.loraModel.update({
      where: { id: loraModelId },
      data: { status: 'failed', errorMessage: error.message },
    })
    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'draft' } })
  }
}

export const maxDuration = 300
export const dynamic = 'force-dynamic'
