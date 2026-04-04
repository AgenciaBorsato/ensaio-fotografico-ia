import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function HomePage() {
  const { userId } = await auth()

  if (userId) {
    redirect('/photographer')
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.03) 0%, transparent 70%), radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.02) 0%, transparent 60%)' }} />

      <div className="relative z-10 text-center max-w-lg px-6">
        <h1 className="font-display text-5xl font-bold text-gold-400 tracking-wide mb-2">STUDIO</h1>
        <p className="text-[11px] text-white/30 tracking-[4px] uppercase mb-8">Ensaio Fotografico com IA</p>

        <p className="text-sm text-white/40 leading-relaxed mb-10">
          Recrie ensaios fotograficos com inteligencia artificial.
          Treinamento personalizado para resultados com ate 95-100% de semelhanca.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-in"
            className="px-8 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="px-8 py-4 border border-gold-400/30 text-gold-400 rounded-xl text-sm font-semibold hover:border-gold-400/60 transition"
          >
            Criar Conta
          </Link>
        </div>

        <div className="mt-16 text-[11px] text-white/15 leading-relaxed">
          <p>Powered by FLUX AI + LoRA Training</p>
          <p>Upscale + Restauracao Facial Automatica</p>
        </div>
      </div>
    </div>
  )
}
