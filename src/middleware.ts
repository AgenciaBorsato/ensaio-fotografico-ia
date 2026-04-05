import { NextRequest, NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'studio2026'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas publicas (nao precisam de senha)
  if (pathname === '/login' || pathname.startsWith('/api/webhooks') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // API de login
  if (pathname === '/api/login') {
    return NextResponse.next()
  }

  // Verificar cookie de autenticacao
  const authCookie = request.cookies.get('studio_auth')?.value
  if (authCookie === ADMIN_PASSWORD) {
    return NextResponse.next()
  }

  // Redirecionar para login
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
