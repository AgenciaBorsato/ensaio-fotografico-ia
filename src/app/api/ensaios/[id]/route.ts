import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPublicProxyUrl } from '@/lib/r2'

// GET /api/ensaios/[id] — detalhes do ensaio
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id },
    include: {
      referencePhotos: { orderBy: { order: 'asc' } },
      loraModel: true,
      generatedPhotos: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!ensaio) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

  // Adicionar URLs de thumbnail para fotos de referencia
  const ensaioWithUrls = {
    ...ensaio,
    referencePhotos: ensaio.referencePhotos.map((p) => ({
      ...p,
      thumbnailUrl: getPublicProxyUrl(p.photoUrl),
    })),
  }

  return NextResponse.json(ensaioWithUrls)
}

// DELETE /api/ensaios/[id] — limpar fotos de referencia
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  await db.referencePhoto.deleteMany({ where: { ensaioId: id } })
  // Resetar LoRA se existir (precisa re-treinar com novas fotos)
  await db.loraModel.deleteMany({ where: { ensaioId: id } })
  await db.ensaio.update({ where: { id }, data: { status: 'draft' } })

  return NextResponse.json({ success: true })
}

// PATCH /api/ensaios/[id] — atualizar prompts, descricao, etc
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const data: any = {}
  if (body.prompts !== undefined) data.prompts = body.prompts
  if (body.photosPerPrompt !== undefined) data.photosPerPrompt = body.photosPerPrompt
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description

  const ensaio = await db.ensaio.update({ where: { id }, data })

  return NextResponse.json(ensaio)
}
