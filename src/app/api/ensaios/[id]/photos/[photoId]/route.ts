import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/ensaios/[id]/photos/[photoId] — aprovar ou rejeitar foto
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { photoId } = await params
  const { action, notes } = await req.json()

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Acao invalida' }, { status: 400 })
  }

  const updated = await db.generatedPhoto.update({
    where: { id: photoId },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      notes: notes || null,
    },
  })

  return NextResponse.json(updated)
}
