import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { tasks } from '@trigger.dev/sdk/v3'
import type { generatePhotosJob } from '@/trigger/jobs/generate-photos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: ensaioId } = await params
  const { clientId, templatePhotoIds } = await req.json()

  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })

  const ensaio = await db.ensaio.findUnique({ where: { id: ensaioId } })
  if (!ensaio || ensaio.photographerId !== user.id) {
    return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  }

  // Verificar que o cliente tem LoRA treinado
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { loraModel: true },
  })

  if (!client?.loraModel || client.loraModel.status !== 'completed') {
    return NextResponse.json({ error: 'LoRA nao treinado ainda' }, { status: 400 })
  }

  const handle = await tasks.trigger<typeof generatePhotosJob>('generate-photos', {
    clientId,
    ensaioId,
    templatePhotoIds,
  })

  return NextResponse.json({ jobId: handle.id, status: 'triggered' })
}
