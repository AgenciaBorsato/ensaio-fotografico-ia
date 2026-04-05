import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tasks } from '@trigger.dev/sdk/v3'
import type { generatePhotosJob } from '@/trigger/jobs/generate-photos'

// POST /api/ensaios/[id]/generate — gerar fotos
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ensaioId } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { id: ensaioId },
    include: { loraModel: true },
  })

  if (!ensaio) return NextResponse.json({ error: 'Ensaio nao encontrado' }, { status: 404 })
  if (!ensaio.loraModel || ensaio.loraModel.status !== 'completed') {
    return NextResponse.json({ error: 'Treine a IA primeiro' }, { status: 400 })
  }
  if (ensaio.prompts.length === 0) {
    return NextResponse.json({ error: 'Adicione pelo menos um prompt' }, { status: 400 })
  }

  const handle = await tasks.trigger<typeof generatePhotosJob>('generate-photos', { ensaioId })

  return NextResponse.json({ jobId: handle.id, status: 'triggered' })
}
