import { NextRequest, NextResponse } from 'next/server'

// Hash compativel com Edge Runtime (Web Crypto API)
async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_studio_salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas publicas
  if (pathname === '/login' || pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/r2-proxy') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  if (pathname === '/api/login') {
    return NextResponse.next()
  }

  // Verificar cookie de autenticacao (token hash)
  const authCookie = request.cookies.get('studio_auth')?.value
  const password = process.env.ADMIN_PASSWORD
  if (authCookie && password) {
    const expectedToken = await hashToken(password)
    if (authCookie === expectedToken) {
      return NextResponse.next()
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
