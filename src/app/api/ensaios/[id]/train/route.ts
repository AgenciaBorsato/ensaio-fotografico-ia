import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tasks } from '@trigger.dev/sdk/v3'
import type { trainLoraJob } from '@/trigger/jobs/train-lora'

// POST /api/ensaios/[id]/train — iniciar treino LoRA
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ensaioId } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id: ensaioId },
    include: { referencePhotos: true, loraModel: true },
  })

  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  if (ensaio.referencePhotos.length === 0) {
    return NextResponse.json({ error: 'Envie fotos de referencia primeiro' }, { status: 400 })
  }
  if (ensaio.loraModel?.status === 'completed') {
    return NextResponse.json({ message: 'LoRA ja treinado', loraModelId: ensaio.loraModel.id })
  }

  const handle = await tasks.trigger<typeof trainLoraJob>('train-lora', { ensaioId })

  return NextResponse.json({ jobId: handle.id, status: 'triggered' })
}
