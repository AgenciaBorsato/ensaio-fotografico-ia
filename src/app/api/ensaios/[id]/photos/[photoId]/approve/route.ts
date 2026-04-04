import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: ensaioId, photoId } = await params
  const { action, notes } = await req.json() // action: 'approve' | 'reject'

  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user || user.role !== 'photographer') {
    return NextResponse.json({ error: 'Apenas fotografos podem aprovar' }, { status: 403 })
  }

  const photo = await db.generatedPhoto.findUnique({
    where: { id: photoId },
    include: { templatePhoto: { include: { ensaio: true } } },
  })

  if (!photo || photo.templatePhoto.ensaio.id !== ensaioId) {
    return NextResponse.json({ error: 'Foto nao encontrada' }, { status: 404 })
  }

  if (photo.templatePhoto.ensaio.photographerId !== user.id) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 403 })
  }

  const updated = await db.generatedPhoto.update({
    where: { id: photoId },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      photographerNotes: notes || null,
    },
  })

  return NextResponse.json(updated)
}
