import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getPresignedUploadUrl, buildR2Key } from '@/lib/r2'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { ensaioId, clientId, type, contentType, filename } = await req.json()

  if (!ensaioId || !type || !contentType) {
    return NextResponse.json({ error: 'Parametros obrigatorios: ensaioId, type, contentType' }, { status: 400 })
  }

  const validTypes = ['templates', 'references', 'inspiration'] as const
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  }

  const ext = filename?.split('.').pop() || 'jpg'
  const uniqueFilename = `${nanoid(12)}.${ext}`

  const key = buildR2Key({
    ensaioId,
    clientId,
    type,
    filename: uniqueFilename,
  })

  const { url } = await getPresignedUploadUrl(key, contentType)

  return NextResponse.json({ uploadUrl: url, key })
}
