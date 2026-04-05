import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

  return NextResponse.json(ensaio)
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
