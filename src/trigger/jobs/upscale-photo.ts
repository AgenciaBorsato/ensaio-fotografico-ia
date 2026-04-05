import { task, tasks } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate, REPLICATE_VERSIONS } from '@/lib/replicate'
import type { scorePhotoJob } from './score-photo'

export const upscalePhotoJob = task({
  id: 'upscale-photo',
  retry: { maxAttempts: 2 },
  run: async (payload: { generatedPhotoId: string }) => {
    const { generatedPhotoId } = payload

    const photo = await db.generatedPhoto.findUniqueOrThrow({
      where: { id: generatedPhotoId },
    })

    if (!photo.rawUrl) throw new Error('Foto raw nao encontrada')

    // Etapa 1: Upscale com Real-ESRGAN
    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { status: 'upscaling' },
    })

    const upscaleResult = await runPrediction(REPLICATE_VERSIONS.REAL_ESRGAN, {
      image: photo.rawUrl,
      scale: 4,
      face_enhance: true,
    })

    const upscaledUrl = upscaleResult || photo.rawUrl

    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { upscaledUrl, status: 'restoring' },
    })

    // Etapa 2: Restauracao facial com CodeFormer
    const restoreResult = await runPrediction(REPLICATE_VERSIONS.CODEFORMER, {
      image: upscaledUrl,
      upscale: 2,
      face_upsample: true,
      codeformer_fidelity: 0.7,
    })

    const restoredUrl = restoreResult || upscaledUrl

    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { restoredUrl, status: 'scoring' },
    })

    // Disparar face scoring automaticamente
    await tasks.trigger<typeof scorePhotoJob>('score-photo', {
      generatedPhotoId,
    })

    return { generatedPhotoId, upscaledUrl, restoredUrl }
  },
})

async function runPrediction(version: string, input: Record<string, any>): Promise<string | null> {
  try {
    const prediction = await replicate.predictions.create({ version, input })

    let result = prediction
    let pollCount = 0
    while (result.status !== 'succeeded' && result.status !== 'failed' && pollCount < 60) {
      await new Promise((r) => setTimeout(r, 3000))
      result = await replicate.predictions.get(prediction.id)
      pollCount++
    }

    if (result.status !== 'succeeded') return null

    return typeof result.output === 'string' ? result.output : (result.output as any)?.[0] || null
  } catch {
    return null
  }
}
