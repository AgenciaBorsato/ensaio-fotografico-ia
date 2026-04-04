import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

// POST /api/invite/[code]/join — cliente entra no ensaio
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { code } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { inviteCode: code },
  })

  if (!ensaio) return NextResponse.json({ error: 'Convite invalido' }, { status: 404 })

  // Buscar ou criar usuario
  let user = await db.user.findUnique({ where: { clerkId } })
  if (!user) {
    const clerkUser = await currentUser()
    user = await db.user.create({
      data: {
        clerkId,
        email: clerkUser?.emailAddresses[0]?.emailAddress || '',
        name: clerkUser?.firstName || clerkUser?.username || 'Cliente',
        role: 'client',
      },
    })
  }

  // Verificar se ja e cliente deste ensaio
  const existingClient = await db.client.findUnique({
    where: { userId_ensaioId: { userId: user.id, ensaioId: ensaio.id } },
  })

  if (existingClient) {
    return NextResponse.json({ clientId: existingClient.id })
  }

  // Criar vinculo de cliente
  const client = await db.client.create({
    data: {
      userId: user.id,
      ensaioId: ensaio.id,
    },
  })

  // Atualizar status do ensaio se necessario
  if (ensaio.status === 'draft') {
    await db.ensaio.update({
      where: { id: ensaio.id },
      data: { status: 'awaiting_references' },
    })
  }

  return NextResponse.json({ clientId: client.id }, { status: 201 })
}
