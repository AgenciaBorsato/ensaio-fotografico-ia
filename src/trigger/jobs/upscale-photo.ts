import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { replicate, REPLICATE_VERSIONS } from '@/lib/replicate'

export const upscalePhotoJob = task({
  id: 'upscale-photo',
  retry: { maxAttempts: 2 },
  run: async (payload: { generatedPhotoId: string }) => {
    const { generatedPhotoId } = payload

    const photo = await db.generatedPhoto.findUniqueOrThrow({
      where: { id: generatedPhotoId },
    })

    if (!photo.rawUrl) {
      throw new Error('Foto raw nao encontrada')
    }

    // --- Etapa 1: Upscale com Real-ESRGAN ---
    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { status: 'upscaling' },
    })

    const upscalePrediction = await replicate.predictions.create({
      version: REPLICATE_VERSIONS.REAL_ESRGAN,
      input: {
        image: photo.rawUrl,
        scale: 4,
        face_enhance: true,
      },
    })

    let upscaleResult = upscalePrediction
    let pollCount = 0
    while (upscaleResult.status !== 'succeeded' && upscaleResult.status !== 'failed' && pollCount < 60) {
      await new Promise((r) => setTimeout(r, 3000))
      upscaleResult = await replicate.predictions.get(upscalePrediction.id)
      pollCount++
    }

    if (upscaleResult.status === 'failed') {
      // Se upscale falhar, continua com a raw
      console.warn(`Upscale falhou para ${generatedPhotoId}, usando raw`)
    }

    const upscaledUrl = upscaleResult.status === 'succeeded'
      ? (typeof upscaleResult.output === 'string' ? upscaleResult.output : (upscaleResult.output as any)?.[0])
      : photo.rawUrl

    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { upscaledUrl, status: 'restoring' },
    })

    // --- Etapa 2: Restauracao facial com CodeFormer ---
    const restorePrediction = await replicate.predictions.create({
      version: REPLICATE_VERSIONS.CODEFORMER,
      input: {
        image: upscaledUrl,
        upscale: 2,
        face_upsample: true,
        codeformer_fidelity: 0.7,
      },
    })

    let restoreResult = restorePrediction
    pollCount = 0
    while (restoreResult.status !== 'succeeded' && restoreResult.status !== 'failed' && pollCount < 60) {
      await new Promise((r) => setTimeout(r, 3000))
      restoreResult = await replicate.predictions.get(restorePrediction.id)
      pollCount++
    }

    const restoredUrl = restoreResult.status === 'succeeded'
      ? (typeof restoreResult.output === 'string' ? restoreResult.output : (restoreResult.output as any)?.[0])
      : upscaledUrl

    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: {
        restoredUrl,
        status: 'pending_review',
      },
    })

    return { generatedPhotoId, upscaledUrl, restoredUrl }
  },
})
