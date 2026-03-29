import { NextRequest, NextResponse } from 'next/server'

// Restauração facial com CodeFormer — melhora detalhes, pele, iluminação
export async function POST(req: NextRequest) {
  try {
    const { imageUrl, apiKey } = await req.json()

    if (!apiKey) return NextResponse.json({ error: 'API Key não configurada' }, { status: 400 })
    if (!imageUrl) return NextResponse.json({ error: 'URL da imagem obrigatória' }, { status: 400 })

    console.log('[Replicate Restore] Iniciando restauração facial...')

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
        input: {
          image: imageUrl,
          upscale: 2,
          face_upsample: true,
          codeformer_fidelity: 0.7,
        },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      return NextResponse.json({ error: errData.detail || `Erro: ${response.status}` }, { status: response.status })
    }

    const prediction = await response.json()
    return NextResponse.json({ id: prediction.id, status: prediction.status, output: prediction.output })
  } catch (error: any) {
    console.error('[Replicate Restore]', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
