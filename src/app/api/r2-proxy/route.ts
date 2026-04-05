import { NextRequest, NextResponse } from 'next/server'
import { r2Client } from '@/lib/r2'
import { GetObjectCommand } from '@aws-sdk/client-s3'

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ensaio-studio'

// GET /api/r2-proxy?key=ensaios/xxx/references/yyy.jpg
// Rota publica para servir arquivos do R2 (usado pelo Replicate para acessar imagens)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')

  // Validar que a key parece ser um path valido do R2 (comeca com "ensaios/")
  if (!key || !key.startsWith('ensaios/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
    const response = await r2Client.send(command)

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const bytes = await response.Body.transformToByteArray()
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': response.ContentType || 'image/jpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error: any) {
    console.error('[R2 Proxy Error]', error.message)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export const dynamic = 'force-dynamic'
