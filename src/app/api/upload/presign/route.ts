import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPresignedUploadUrl, buildR2Key } from '@/lib/r2'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const { ensaioId, type, contentType, filename } = await req.json()

  if (!ensaioId || !type || !contentType) {
    return NextResponse.json({ error: 'Parametros obrigatorios: ensaioId, type, contentType' }, { status: 400 })
  }

  const validTypes = ['references', 'inspiration'] as const
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  }

  const ensaio = await db.ensaio.findUnique({ where: { id: ensaioId } })
  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })

  const ext = filename?.split('.').pop() || 'jpg'
  const uniqueFilename = `${nanoid(12)}.${ext}`
  const key = buildR2Key({ ensaioId, type, filename: uniqueFilename })

  const { url } = await getPresignedUploadUrl(key, contentType)

  if (type === 'references') {
    const count = await db.referencePhoto.count({ where: { ensaioId } })
    if (count >= 12) {
      return NextResponse.json({ error: 'Maximo de 12 fotos de referencia' }, { status: 400 })
    }
    await db.referencePhoto.create({
      data: { ensaioId, photoUrl: key, order: count },
    })
  } else if (type === 'inspiration') {
    await db.ensaio.update({
      where: { id: ensaioId },
      data: { inspirationPhotoUrl: key },
    })
  }

  return NextResponse.json({ uploadUrl: url, key })
}
