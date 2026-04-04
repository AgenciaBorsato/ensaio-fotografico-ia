import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate, MODELS, REPLICATE_VERSIONS } from '@/lib/replicate'
import { getPresignedDownloadUrl, getPresignedUploadUrl, buildR2Key } from '@/lib/r2'

const BATCH_SIZE = 3 // maximo de fotos geradas em paralelo

export const generatePhotosJob = task({
  id: 'generate-photos',
  retry: { maxAttempts: 1 },
  run: async (payload: { clientId: string; ensaioId: string; templatePhotoIds?: string[] }) => {
    const { clientId, ensaioId, templatePhotoIds } = payload

    // 1. Buscar dados
    const client = await db.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        loraModel: true,
        referencePhotos: true,
      },
    })

    if (!client.loraModel || client.loraModel.status !== 'completed') {
      throw new Error('LoRA nao treinado. Execute o treino primeiro.')
    }

    const ensaio = await db.ensaio.findUniqueOrThrow({
      where: { id: ensaioId },
      include: {
        templatePhotos: templatePhotoIds
          ? { where: { id: { in: templatePhotoIds } }, orderBy: { order: 'asc' } }
          : { orderBy: { order: 'asc' } },
      },
    })

    if (ensaio.templatePhotos.length === 0) {
      throw new Error('Nenhuma foto template encontrada.')
    }

    await db.ensaio.update({
      where: { id: ensaioId },
      data: { status: 'generating' },
    })

    // 2. Buscar foto de inspiracao (se existir)
    let inspirationContext = ''
    if (client.inspirationPhotoUrl) {
      inspirationContext = ', inspired by the reference style and mood'
    }

    const triggerWord = client.loraModel.triggerWord
    const loraUrl = client.loraModel.replicateModelUrl || client.loraModel.loraUrl

    // 3. Processar em batches de 3
    const templates = ensaio.templatePhotos
    const results: { templatePhotoId: string; generatedPhotoId: string }[] = []

    for (let i = 0; i < templates.length; i += BATCH_SIZE) {
      const batch = templates.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (template) => {
          // Criar registro no banco
          const generatedPhoto = await db.generatedPhoto.create({
            data: {
              clientId,
              templatePhotoId: template.id,
              status: 'generating',
              attempt: 1,
              seed: Math.floor(Math.random() * 2147483647),
            },
          })

          try {
            // Construir prompt
            const prompt = template.prompt
              ? `${template.prompt}, photo of ${triggerWord}${inspirationContext}, professional photography, high quality, detailed face`
              : `A professional photo of ${triggerWord}${inspirationContext}, natural lighting, sharp details, 8k quality`

            // Chamar FLUX.1-dev com LoRA
            const prediction = await replicate.predictions.create({
              model: MODELS.FLUX_DEV_LORA,
              input: {
                prompt,
                hf_lora: loraUrl,
                num_outputs: 1,
                aspect_ratio: '3:4',
                output_format: 'png',
                guidance_scale: 3.5,
                output_quality: 95,
                num_inference_steps: 28,
                seed: generatedPhoto.seed,
              },
            })

            // Aguardar resultado
            let result = prediction
            let pollCount = 0
            while (
              result.status !== 'succeeded' &&
              result.status !== 'failed' &&
              pollCount < 60
            ) {
              await new Promise((r) => setTimeout(r, 3000))
              result = await replicate.predictions.get(prediction.id)
              pollCount++
            }

            if (result.status === 'failed') {
              throw new Error(`Geracao falhou: ${result.error}`)
            }

            const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output

            // Atualizar foto no banco
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: {
                rawUrl: outputUrl as string,
                status: 'upscaling',
                replicatePredictionId: prediction.id,
              },
            })

            return { templatePhotoId: template.id, generatedPhotoId: generatedPhoto.id }
          } catch (error: any) {
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { status: 'rejected' },
            })
            throw error
          }
        })
      )

      // Coletar resultados do batch
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        }
      }
    }

    // 4. Atualizar status do ensaio
    if (results.length > 0) {
      await db.ensaio.update({
        where: { id: ensaioId },
        data: { status: 'completed' },
      })
    }

    return { generated: results.length, total: templates.length, results }
  },
})
