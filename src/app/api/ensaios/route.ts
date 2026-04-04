import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { nanoid } from 'nanoid'

// GET /api/ensaios — listar ensaios do fotografo
export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })

  const ensaios = await db.ensaio.findMany({
    where: { photographerId: user.id },
    include: {
      templatePhotos: { select: { id: true } },
      clients: {
        select: {
          id: true,
          loraModel: { select: { status: true } },
          _count: { select: { generatedPhotos: true, referencePhotos: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(ensaios)
}

// POST /api/ensaios — criar novo ensaio
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user || user.role !== 'photographer') {
    return NextResponse.json({ error: 'Apenas fotografos podem criar ensaios' }, { status: 403 })
  }

  const { name, description } = await req.json()
  if (!name) return NextResponse.json({ error: 'Nome obrigatorio' }, { status: 400 })

  const ensaio = await db.ensaio.create({
    data: {
      name,
      description,
      photographerId: user.id,
      inviteCode: nanoid(10),
      status: 'draft',
    },
  })

  return NextResponse.json(ensaio, { status: 201 })
}
