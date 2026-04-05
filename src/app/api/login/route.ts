import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

// Mesmo hash usado no middleware (resultado identico ao Web Crypto API)
function hashToken(password: string): string {
  return crypto.createHash('sha256').update(password + '_studio_salt').digest('hex').slice(0, 32)
}

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  const token = hashToken(password)
  const response = NextResponse.json({ success: true })
  response.cookies.set('studio_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })

  return response
}
