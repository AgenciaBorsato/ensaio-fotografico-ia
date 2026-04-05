import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/lib/db'
import { scoreFaceSimilarity, isFaceScoringAvailable } from '@/lib/face-scoring'
import { getPresignedDownloadUrl } from '@/lib/r2'

export const scorePhotoJob = task({
  id: 'score-photo',
  retry: { maxAttempts: 2 },
  run: async (payload: { generatedPhotoId: string }) => {
    const { generatedPhotoId } = payload

    // Verificar se o servico de scoring esta disponivel
    const available = await isFaceScoringAvailable()
    if (!available) {
      // Se scoring nao esta disponivel, marcar como pending_review sem score
      await db.generatedPhoto.update({
        where: { id: generatedPhotoId },
        data: { status: 'pending_review' },
      })
      return { skipped: true, reason: 'Face scoring service unavailable' }
    }

    const photo = await db.generatedPhoto.findUniqueOrThrow({
      where: { id: generatedPhotoId },
      include: {
        ensaio: {
          include: { referencePhotos: { orderBy: { order: 'asc' } } },
        },
      },
    })

    const imageUrl = photo.restoredUrl || photo.upscaledUrl || photo.rawUrl
    if (!imageUrl) {
      throw new Error('Nenhuma imagem disponivel para scoring')
    }

    // Gerar URLs de download das referencias
    const referenceUrls = await Promise.all(
      photo.ensaio.referencePhotos.map((ref) => getPresignedDownloadUrl(ref.photoUrl))
    )

    if (referenceUrls.length === 0) {
      await db.generatedPhoto.update({
        where: { id: generatedPhotoId },
        data: { status: 'pending_review' },
      })
      return { skipped: true, reason: 'No reference photos' }
    }

    // Atualizar status
    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: { status: 'scoring' },
    })

    // Chamar o servico de scoring
    const result = await scoreFaceSimilarity(imageUrl, referenceUrls)

    const MIN_SCORE = 90
    const isAcceptable = result.score >= MIN_SCORE
    const canRetry = photo.attempt < photo.maxAttempts

    if (isAcceptable) {
      // Score bom — marcar para revisao
      await db.generatedPhoto.update({
        where: { id: generatedPhotoId },
        data: {
          similarityScore: result.score,
          status: 'pending_review',
        },
      })
      return { score: result.score, status: 'accepted', details: result.details }
    }

    if (canRetry) {
      // Score baixo mas pode tentar de novo — regenerar com seed diferente
      await db.generatedPhoto.update({
        where: { id: generatedPhotoId },
        data: {
          similarityScore: result.score,
          status: 'rejected',
          notes: `Auto-rejected: score ${result.score}% (min ${MIN_SCORE}%). Tentativa ${photo.attempt}/${photo.maxAttempts}.`,
        },
      })

      // TODO: disparar regeneracao com seed diferente aqui
      // Por enquanto marca como rejeitado e o usuario pode regenerar manualmente

      return { score: result.score, status: 'auto_rejected', attempt: photo.attempt }
    }

    // Score baixo e sem mais tentativas — mandar pra revisao manual
    await db.generatedPhoto.update({
      where: { id: generatedPhotoId },
      data: {
        similarityScore: result.score,
        status: 'pending_review',
        notes: `Score baixo: ${result.score}% (min ${MIN_SCORE}%). Todas ${photo.maxAttempts} tentativas esgotadas. Revisao manual necessaria.`,
      },
    })

    return { score: result.score, status: 'manual_review', attempts_exhausted: true }
  },
})
