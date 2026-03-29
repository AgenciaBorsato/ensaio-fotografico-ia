import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const apiKey = url.searchParams.get('apiKey')

  if (!id || !apiKey) return NextResponse.json({ error: 'Parâmetros obrigatórios' }, { status: 400 })

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) return NextResponse.json({ error: 'Erro ao consultar status' }, { status: response.status })

    const prediction = await response.json()
    return NextResponse.json({ status: prediction.status, output: prediction.output, error: prediction.error })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
