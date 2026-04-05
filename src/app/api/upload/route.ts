import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { r2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ensaio-studio'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const ensaioId = formData.get('ensaioId') as string
  const type = formData.get('type') as string

  if (!file || !ensaioId || !type) {
    return NextResponse.json({ error: 'file, ensaioId e type sao obrigatorios' }, { status: 400 })
  }

  const validTypes = ['references', 'inspiration']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  }

  const ensaio = await db.ensaio.findUnique({ where: { id: ensaioId } })
  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })

  // Gerar chave unica
  const ext = file.name.split('.').pop() || 'jpg'
  const key = `ensaios/${ensaioId}/${type}/${nanoid(12)}.${ext}`

  // Upload para R2 via servidor
  const buffer = Buffer.from(await file.arrayBuffer())
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }))

  // Salvar no banco
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

  return NextResponse.json({ key, success: true })
}

export const config = {
  api: { bodyParser: false },
}
