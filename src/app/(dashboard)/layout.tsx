import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gold-400/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/photographer">
            <h1 className="font-display text-xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
          </Link>
          <nav className="flex gap-4">
            <Link href="/photographer" className="text-sm text-white/50 hover:text-gold-400 transition">
              Meus Ensaios
            </Link>
          </nav>
        </div>
        <UserButton />
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
