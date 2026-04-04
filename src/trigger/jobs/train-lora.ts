import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate, MODELS } from '@/lib/replicate'
import { getPresignedDownloadUrl } from '@/lib/r2'

export const trainLoraJob = task({
  id: 'train-lora',
  retry: { maxAttempts: 2 },
  run: async (payload: { clientId: string; ensaioId: string }) => {
    const { clientId, ensaioId } = payload

    // 1. Buscar dados do cliente e fotos de referencia
    const client = await db.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        referencePhotos: { orderBy: { order: 'asc' } },
        loraModel: true,
      },
    })

    // Se ja tem LoRA treinado, reutilizar
    if (client.loraModel?.status === 'completed' && client.loraModel.loraUrl) {
      return { loraModelId: client.loraModel.id, reused: true }
    }

    // 2. Gerar URLs de download das fotos de referencia
    const imageUrls = await Promise.all(
      client.referencePhotos.map(async (photo) => {
        return getPresignedDownloadUrl(photo.photoUrl)
      })
    )

    // 3. Criar trigger word unico
    const triggerWord = `ENSAIO_${clientId.slice(0, 8).toUpperCase()}`

    // 4. Criar registro do LoRA no banco
    const loraModel = await db.loraModel.upsert({
      where: { clientId },
      create: {
        clientId,
        triggerWord,
        status: 'processing',
      },
      update: {
        status: 'processing',
        progress: 0,
        errorMessage: null,
      },
    })

    // 5. Atualizar status do ensaio
    await db.ensaio.update({
      where: { id: ensaioId },
      data: { status: 'training' },
    })

    try {
      // 6. Iniciar treino no Replicate
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

      // 7. Salvar ID do treino
      await db.loraModel.update({
        where: { id: loraModel.id },
        data: {
          replicateTrainingId: training.id,
          progress: 10,
        },
      })

      // 8. Aguardar conclusao do treino (polling)
      let trainingResult = training
      let pollCount = 0
      const maxPolls = 180 // 30 min max (10s intervals)

      while (
        trainingResult.status !== 'succeeded' &&
        trainingResult.status !== 'failed' &&
        trainingResult.status !== 'canceled' &&
        pollCount < maxPolls
      ) {
        await new Promise((r) => setTimeout(r, 10000)) // 10s entre polls
        trainingResult = await replicate.trainings.get(training.id)
        pollCount++

        // Atualizar progresso
        const progress = Math.min(10 + Math.floor((pollCount / maxPolls) * 80), 90)
        await db.loraModel.update({
          where: { id: loraModel.id },
          data: { progress },
        })
      }

      if (trainingResult.status === 'failed' || trainingResult.status === 'canceled') {
        throw new Error(`Treino ${trainingResult.status}: ${trainingResult.error || 'Erro desconhecido'}`)
      }

      // 9. Treino concluido — salvar resultado
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

      await db.ensaio.update({
        where: { id: ensaioId },
        data: { status: 'trained' },
      })

      return { loraModelId: loraModel.id, reused: false, trainingId: training.id }
    } catch (error: any) {
      await db.loraModel.update({
        where: { id: loraModel.id },
        data: {
          status: 'failed',
          errorMessage: error.message,
        },
      })

      await db.ensaio.update({
        where: { id: ensaioId },
        data: { status: 'trained' }, // volta pro status anterior
      })

      throw error
    }
  },
})
