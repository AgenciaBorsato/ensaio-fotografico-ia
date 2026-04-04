import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Webhook do Clerk para sincronizar usuarios
// Configurar no dashboard do Clerk: user.created, user.updated
export async function POST(req: NextRequest) {
  const payload = await req.json()
  const { type, data } = payload

  if (type === 'user.created') {
    const { id, email_addresses, first_name, last_name, username, public_metadata } = data

    await db.user.upsert({
      where: { clerkId: id },
      create: {
        clerkId: id,
        email: email_addresses?.[0]?.email_address || '',
        name: [first_name, last_name].filter(Boolean).join(' ') || username || 'Usuario',
        role: public_metadata?.role === 'photographer' ? 'photographer' : 'client',
      },
      update: {
        email: email_addresses?.[0]?.email_address || '',
        name: [first_name, last_name].filter(Boolean).join(' ') || username || 'Usuario',
      },
    })
  }

  if (type === 'user.updated') {
    const { id, email_addresses, first_name, last_name, username, public_metadata } = data

    await db.user.upsert({
      where: { clerkId: id },
      create: {
        clerkId: id,
        email: email_addresses?.[0]?.email_address || '',
        name: [first_name, last_name].filter(Boolean).join(' ') || username || 'Usuario',
        role: public_metadata?.role === 'photographer' ? 'photographer' : 'client',
      },
      update: {
        email: email_addresses?.[0]?.email_address || '',
        name: [first_name, last_name].filter(Boolean).join(' ') || username || 'Usuario',
        role: public_metadata?.role === 'photographer' ? 'photographer' : undefined,
      },
    })
  }

  return NextResponse.json({ received: true })
}
