import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gold-400/10 px-6 py-4 flex items-center justify-between">
        <Link href="/ensaios">
          <div>
            <h1 className="font-display text-xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
            <p className="text-[9px] text-white/25 tracking-[3px] uppercase">Ensaio com IA</p>
          </div>
        </Link>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
