import { NextRequest, NextResponse } from 'next/server'

// Modelos disponíveis no Replicate
const MODELS = {
  // Rápido e barato — face swap básico
  fast: {
    version: 'cff87316e31787df12002c9e20a78a017a36cb31fde9c9c987396e16c0f8c4c4',
    inputMap: (source: string, target: string) => ({
      swap_image: source,
      target_image: target,
    }),
  },
  // Premium — facefusion (melhor qualidade, mais realista)
  premium: {
    version: '941fb8fc8bdb46de359c7c3b7e3e537eb9dd6a59ee37e5a5f413c344e7c932e0',
    inputMap: (source: string, target: string) => ({
      source_image: source,
      target_image: target,
      face_enhancer_model: 'codeformer',
      face_swapper_model: 'inswapper_128_fp16',
      output_image_quality: 95,
    }),
  },
} as const

// Modelo de restauração facial (pós-processamento)
const RESTORE_MODEL = {
  version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56', // codeformer
  inputMap: (imageUrl: string) => ({
    image: imageUrl,
    upscale: 2,
    face_upsample: true,
    codeformer_fidelity: 0.7,
  }),
}

export async function POST(req: NextRequest) {
  try {
    const { sourceBase64, targetBase64, apiKey, quality = 'fast' } = await req.json()

    if (!apiKey) return NextResponse.json({ error: 'API Key do Replicate não configurada' }, { status: 400 })
    if (!sourceBase64 || !targetBase64) return NextResponse.json({ error: 'Imagens obrigatórias' }, { status: 400 })

    const model = quality === 'premium' ? MODELS.premium : MODELS.fast

    console.log(`[Replicate] Usando modelo: ${quality}`)

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: model.version,
        input: model.inputMap(sourceBase64, targetBase64),
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      return NextResponse.json({ error: errData.detail || `Erro na API Replicate: ${response.status}` }, { status: response.status })
    }

    const prediction = await response.json()
    return NextResponse.json({
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      quality,
    })
  } catch (error: any) {
    console.error('[Replicate Swap]', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
