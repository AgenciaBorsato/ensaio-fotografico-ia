'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewEnsaioPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ensaios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar ensaio')
      }

      const ensaio = await res.json()
      router.push(`/ensaios/${ensaio.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-display text-3xl font-normal mb-2">
        Novo <span className="text-gold-400 italic">Ensaio</span>
      </h2>
      <p className="text-sm text-white/35 mb-8">Crie um novo ensaio fotografico com IA</p>

      {error && (
        <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider block mb-2">Nome do Ensaio</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ensaio Gestante Maria"
            className="w-full px-4 py-3 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-[#f0ece4] outline-none focus:border-gold-400/50 transition"
            required
          />
        </div>

        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider block mb-2">Descricao (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes sobre o ensaio..."
            rows={3}
            className="w-full px-4 py-3 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-[#f0ece4] outline-none focus:border-gold-400/50 transition resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className={`flex-1 py-4 rounded-xl text-sm font-semibold transition-all ${
              loading || !name.trim()
                ? 'bg-white/[0.05] text-white/20 cursor-not-allowed'
                : 'bg-gold-400 text-studio-bg hover:bg-gold-300'
            }`}
          >
            {loading ? 'Criando...' : 'Criar Ensaio'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
