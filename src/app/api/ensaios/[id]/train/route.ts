import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { tasks } from '@trigger.dev/sdk/v3'
import type { trainLoraJob } from '@/trigger/jobs/train-lora'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: ensaioId } = await params
  const { clientId } = await req.json()

  // Verificar que o fotografo e dono do ensaio
  const user = await db.user.findUnique({ where: { clerkId } })
  if (!user) return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })

  const ensaio = await db.ensaio.findUnique({ where: { id: ensaioId } })
  if (!ensaio || ensaio.photographerId !== user.id) {
    return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  }

  // Verificar que o cliente tem fotos de referencia
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { referencePhotos: true, loraModel: true },
  })

  if (!client) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
  if (client.referencePhotos.length === 0) {
    return NextResponse.json({ error: 'Cliente precisa enviar fotos de referencia' }, { status: 400 })
  }

  // Se ja tem LoRA treinado, nao precisa treinar de novo
  if (client.loraModel?.status === 'completed') {
    return NextResponse.json({ message: 'LoRA ja treinado', loraModelId: client.loraModel.id })
  }

  // Disparar job de treino
  const handle = await tasks.trigger<typeof trainLoraJob>('train-lora', {
    clientId,
    ensaioId,
  })

  return NextResponse.json({ jobId: handle.id, status: 'triggered' })
}
