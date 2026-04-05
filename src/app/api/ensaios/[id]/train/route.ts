import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { replicate } from '@/lib/replicate'
import { getPresignedDownloadUrl } from '@/lib/r2'

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

  // Gerar URLs das fotos de referencia
  const imageUrls = await Promise.all(
    ensaio.referencePhotos.map((photo) => getPresignedDownloadUrl(photo.photoUrl))
  )

  const triggerWord = `ENSAIO_${ensaioId.slice(0, 8).toUpperCase()}`

  // Criar/atualizar registro do LoRA
  const loraModel = await db.loraModel.upsert({
    where: { ensaioId },
    create: { ensaioId, triggerWord, status: 'processing' },
    update: { status: 'processing', progress: 0, errorMessage: null },
  })

  await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'training' } })

  // Disparar treino em background (nao bloqueia a resposta)
  runTraining(ensaioId, loraModel.id, imageUrls, triggerWord).catch(console.error)

  return NextResponse.json({ status: 'training_started', loraModelId: loraModel.id })
}

async function runTraining(ensaioId: string, loraModelId: string, imageUrls: string[], triggerWord: string) {
  try {
    // Buscar versao mais recente do modelo
    const trainerModel = await replicate.models.get('ostris', 'flux-dev-lora-trainer')
    const latestVersion = trainerModel.latest_version?.id
    if (!latestVersion) throw new Error('Versao do modelo nao encontrada')

    const username = process.env.REPLICATE_USERNAME || 'studio'
    const modelName = triggerWord.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const destination = `${username}/${modelName}`

    // Criar modelo de destino no Replicate (se nao existir)
    try {
      await replicate.models.get(username, modelName)
    } catch {
      await replicate.models.create(username, modelName, {
        visibility: 'private',
        hardware: 'gpu-t4',
        description: `LoRA model for ensaio ${ensaioId}`,
      })
    }

    const training = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      latestVersion,
      {
        destination: destination as `${string}/${string}`,
        input: {
          input_images: imageUrls.join('\n'),
          trigger_word: triggerWord,
          steps: 1000,
          learning_rate: 0.0004,
          lora_rank: 16,
          resolution: '1024',
          autocaption: true,
        },
      }
    )

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
  } catch (error: any) {
    console.error('[Train Error]', error)
    await db.loraModel.update({
      where: { id: loraModelId },
      data: { status: 'failed', errorMessage: error.message },
    })
    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'draft' } })
  }
}

export const maxDuration = 300 // 5 minutos max para a resposta inicial
export const dynamic = 'force-dynamic'
