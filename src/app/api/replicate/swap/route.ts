import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { sourceBase64, targetBase64, apiKey } = await req.json()

    if (!apiKey) return NextResponse.json({ error: 'API Key do Replicate não configurada' }, { status: 400 })
    if (!sourceBase64 || !targetBase64) return NextResponse.json({ error: 'Imagens obrigatórias' }, { status: 400 })

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'cff87316e31787df12002c9e20a78a017a36cb31fde9c9c987396e16c0f8c4c4',
        input: { swap_image: sourceBase64, target_image: targetBase64 },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      return NextResponse.json({ error: errData.detail || `Erro na API Replicate: ${response.status}` }, { status: response.status })
    }

    const prediction = await response.json()
    return NextResponse.json({ id: prediction.id, status: prediction.status, output: prediction.output })
  } catch (error: any) {
    console.error('[Replicate Swap]', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
