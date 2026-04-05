import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/ensaios — listar todos os ensaios
export async function GET() {
  const ensaios = await db.ensaio.findMany({
    include: {
      _count: { select: { referencePhotos: true, generatedPhotos: true } },
      loraModel: { select: { status: true, progress: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(ensaios)
}

// POST /api/ensaios — criar novo ensaio
export async function POST(req: NextRequest) {
  const { name, description } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome obrigatorio' }, { status: 400 })

  const ensaio = await db.ensaio.create({
    data: { name, description, status: 'draft' },
  })

  return NextResponse.json(ensaio, { status: 201 })
}
