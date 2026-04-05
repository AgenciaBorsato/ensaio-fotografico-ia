import { task, tasks } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate, MODELS } from '@/lib/replicate'
import type { upscalePhotoJob } from './upscale-photo'

const BATCH_SIZE = 3

export const generatePhotosJob = task({
  id: 'generate-photos',
  retry: { maxAttempts: 1 },
  run: async (payload: { ensaioId: string }) => {
    const { ensaioId } = payload

    const ensaio = await db.ensaio.findUniqueOrThrow({
      where: { id: ensaioId },
      include: { loraModel: true },
    })

    if (!ensaio.loraModel || ensaio.loraModel.status !== 'completed') {
      throw new Error('LoRA nao treinado.')
    }

    if (ensaio.prompts.length === 0) {
      throw new Error('Adicione pelo menos um prompt de geracao.')
    }

    await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'generating' } })

    const triggerWord = ensaio.loraModel.triggerWord
    const loraUrl = ensaio.loraModel.replicateModelUrl || ensaio.loraModel.loraUrl
    const inspirationContext = ensaio.inspirationPhotoUrl ? ', inspired by the reference style and mood' : ''

    // Expandir prompts conforme photosPerPrompt
    const allPrompts: string[] = []
    for (const prompt of ensaio.prompts) {
      for (let j = 0; j < ensaio.photosPerPrompt; j++) {
        allPrompts.push(prompt)
      }
    }

    const results: { generatedPhotoId: string }[] = []

    for (let i = 0; i < allPrompts.length; i += BATCH_SIZE) {
      const batch = allPrompts.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (promptText) => {
          const fullPrompt = `${promptText}, photo of ${triggerWord}${inspirationContext}, professional photography, high quality, detailed face, sharp focus, 8k`

          const generatedPhoto = await db.generatedPhoto.create({
            data: {
              ensaioId,
              prompt: promptText,
              status: 'generating',
              attempt: 1,
              seed: Math.floor(Math.random() * 2147483647),
            },
          })

          try {
            const prediction = await replicate.predictions.create({
              model: MODELS.FLUX_DEV_LORA,
              input: {
                prompt: fullPrompt,
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

            let result = prediction
            let pollCount = 0
            while (result.status !== 'succeeded' && result.status !== 'failed' && pollCount < 60) {
              await new Promise((r) => setTimeout(r, 3000))
              result = await replicate.predictions.get(prediction.id)
              pollCount++
            }

            if (result.status === 'failed') throw new Error(`Geracao falhou: ${result.error}`)

            const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output

            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { rawUrl: outputUrl as string, status: 'upscaling', replicatePredictionId: prediction.id },
            })

            // Disparar upscale automaticamente
            await tasks.trigger<typeof upscalePhotoJob>('upscale-photo', {
              generatedPhotoId: generatedPhoto.id,
            })

            return { generatedPhotoId: generatedPhoto.id }
          } catch (error: any) {
            await db.generatedPhoto.update({
              where: { id: generatedPhoto.id },
              data: { status: 'rejected' },
            })
            throw error
          }
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') results.push(result.value)
      }
    }

    if (results.length > 0) {
      await db.ensaio.update({ where: { id: ensaioId }, data: { status: 'completed' } })
    }

    return { generated: results.length, total: allPrompts.length, results }
  },
})
