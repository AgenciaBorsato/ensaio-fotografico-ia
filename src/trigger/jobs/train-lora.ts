import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate } from '@/lib/replicate'
import { getPresignedDownloadUrl } from '@/lib/r2'

export const trainLoraJob = task({
  id: 'train-lora',
  retry: { maxAttempts: 2 },
  run: async (payload: { ensaioId: string }) => {
    const { ensaioId } = payload

    const ensaio = await db.ensaio.findUniqueOrThrow({
      where: { id: ensaioId },
      include: {
        referencePhotos: { orderBy: { order: 'asc' } },
        loraModel: true,
      },
    })

    // Se ja tem LoRA treinado, reutilizar
    if (ensaio.loraModel?.status === 'completed' && ensaio.loraModel.loraUrl) {
      return { loraModelId: ensaio.loraModel.id, reused: true }
    }

    // Gerar URLs de download das fotos de referencia
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

    try {
      // Iniciar treino no Replicate
      const training = await replicate.trainings.create(
        'ostris',
        'flux-dev-lora-trainer',
        '26dce37a',
        {
          destination: `${process.env.REPLICATE_USERNAME || 'studio'}/${triggerWord.toLowerCase()}` as `${string}/${string}`,
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
        where: { id: loraModel.id },
        data: { replicateTrainingId: training.id, progress: 10 },
      })

      // Aguardar conclusao (polling)
      let trainingResult = training
      let pollCount = 0
      const maxPolls = 180

      while (
        trainingResult.status !== 'succeeded' &&
        trainingResult.status !== 'failed' &&
        trainingResult.status !== 'canceled' &&
        pollCount < maxPolls
      ) {
        await new Promise((r) => setTimeout(r, 10000))
        trainingResult = await replicate.trainings.get(training.id)
        pollCount++
        await db.loraModel.update({
          where: { id: loraModel.id },
          data: { progress: Math.min(10 + Math.floor((pollCount / maxPolls) * 80), 90) },
        })
      }

      if (trainingResult.status !== 'succeeded') {
        throw new Error(`Treino ${trainingResult.status}: ${trainingResult.error || 'Erro desconhecido'}`)
      }

      const loraUrl = (trainingResult.output as any)?.weights || (trainingResult.output as any)?.version
      const modelUrl = (trainingResult as any).model

      await db.loraModel.update({
        where: { id: loraModel.id },
        data: {
          status: 'completed',
          progress: 100,
          loraUrl: typeof loraUrl === 'string' ? loraUrl : JSON.stringify(loraUrl),
          replicateModelUrl: typeof modelUrl === 'string' ? modelUrl : undefined,
          completedAt: new Date(),
        },
      })

      await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'trained' } })

      return { loraModelId: loraModel.id, reused: false }
    } catch (error: any) {
      await db.loraModel.update({
        where: { id: loraModel.id },
        data: { status: 'failed', errorMessage: error.message },
      })
      await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'draft' } })
      throw error
    }
  },
})
