'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Ensaio {
  id: string
  name: string
  description: string | null
  inviteCode: string
  status: string
  createdAt: string
  templatePhotos: { id: string }[]
  clients: {
    id: string
    loraModel: { status: string } | null
    _count: { generatedPhotos: number; referencePhotos: number }
  }[]
}

export default function PhotographerDashboard() {
  const [ensaios, setEnsaios] = useState<Ensaio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ensaios')
      .then((r) => r.json())
      .then(setEnsaios)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'text-white/40' },
    awaiting_references: { label: 'Aguardando referencias', color: 'text-yellow-400' },
    training: { label: 'Treinando IA', color: 'text-blue-400' },
    trained: { label: 'IA Treinada', color: 'text-green-400' },
    generating: { label: 'Gerando fotos', color: 'text-purple-400' },
    completed: { label: 'Concluido', color: 'text-gold-400' },
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-3xl font-normal">Meus <span className="text-gold-400 italic">Ensaios</span></h2>
          <p className="text-sm text-white/35 mt-1">Gerencie seus ensaios fotograficos com IA</p>
        </div>
        <Link
          href="/photographer/ensaios/new"
          className="px-6 py-3 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
        >
          + Novo Ensaio
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-white/30">Carregando...</div>
      ) : ensaios.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4 opacity-50">📷</div>
          <p className="text-white/40 mb-4">Nenhum ensaio criado ainda</p>
          <Link
            href="/photographer/ensaios/new"
            className="inline-block px-6 py-3 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
          >
            Criar primeiro ensaio
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {ensaios.map((ensaio) => {
            const st = statusLabels[ensaio.status] || statusLabels.draft
            return (
              <Link
                key={ensaio.id}
                href={`/photographer/ensaios/${ensaio.id}`}
                className="block p-6 bg-white/[0.03] border border-gold-400/10 rounded-2xl hover:border-gold-400/30 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-xl text-[#f0ece4]">{ensaio.name}</h3>
                    {ensaio.description && (
                      <p className="text-sm text-white/35 mt-1">{ensaio.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
                </div>
                <div className="flex gap-6 mt-4 text-xs text-white/30">
                  <span>{ensaio.templatePhotos.length} templates</span>
                  <span>{ensaio.clients.length} clientes</span>
                  <span>Codigo: {ensaio.inviteCode}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
