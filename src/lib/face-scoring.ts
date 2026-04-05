const FACE_SCORING_URL = process.env.FACE_SCORING_URL || 'http://face-scoring.railway.internal:8000'

interface ScoreResult {
  score: number
  faces_detected_generated: number
  faces_detected_references: number
  details: {
    avg_cosine_similarity: number
    max_cosine_similarity: number
    min_cosine_similarity: number
    num_references_used: number
    similarities: number[]
  }
}

export async function scoreFaceSimilarity(
  generatedUrl: string,
  referenceUrls: string[]
): Promise<ScoreResult> {
  const response = await fetch(`${FACE_SCORING_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generated_url: generatedUrl,
      reference_urls: referenceUrls,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Face scoring failed: ${error.detail || response.statusText}`)
  }

  return response.json()
}

export async function isFaceScoringAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${FACE_SCORING_URL}/health`, { signal: AbortSignal.timeout(5000) })
    return response.ok
  } catch {
    return false
  }
}
