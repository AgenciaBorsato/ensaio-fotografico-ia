'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        setError('Senha incorreta')
        return
      }

      router.push('/ensaios')
      router.refresh()
    } catch {
      setError('Erro ao conectar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
          <p className="text-[10px] text-white/25 tracking-[4px] uppercase mt-1">Ensaio com IA</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha de acesso"
            className="w-full px-4 py-4 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-center text-[#f0ece4] outline-none focus:border-gold-400/50 transition tracking-widest"
            autoFocus
          />

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className={`w-full py-4 rounded-xl text-sm font-semibold transition-all ${
              loading || !password
                ? 'bg-white/[0.05] text-white/20 cursor-not-allowed'
                : 'bg-gold-400 text-studio-bg hover:bg-gold-300'
            }`}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
