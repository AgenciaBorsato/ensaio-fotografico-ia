import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

// GET /api/invite/[code] — obter info do ensaio pelo codigo de convite
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const ensaio = await db.ensaio.findUnique({
    where: { inviteCode: code },
    include: {
      photographer: { select: { name: true } },
      templatePhotos: { select: { id: true } },
    },
  })

  if (!ensaio) {
    return NextResponse.json({ error: 'Convite invalido' }, { status: 404 })
  }

  // Verificar se o usuario ja e cliente neste ensaio
  let clientId: string | null = null
  const { userId: clerkId } = await auth()
  if (clerkId) {
    const user = await db.user.findUnique({ where: { clerkId } })
    if (user) {
      const existingClient = await db.client.findUnique({
        where: { userId_ensaioId: { userId: user.id, ensaioId: ensaio.id } },
      })
      if (existingClient) clientId = existingClient.id
    }
  }

  return NextResponse.json({
    ensaio: {
      id: ensaio.id,
      name: ensaio.name,
      description: ensaio.description,
      photographer: { name: ensaio.photographer.name },
      templateCount: ensaio.templatePhotos.length,
    },
    clientId,
  })
}
