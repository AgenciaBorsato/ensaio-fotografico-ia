'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import PhotoUploader from '@/components/PhotoUploader'

interface Ensaio {
  id: string
  name: string
  description: string | null
  inviteCode: string
  status: string
  templatePhotos: { id: string; photoUrl: string; order: number; prompt: string }[]
  clients: {
    id: string
    user: { name: string; email: string }
    inspirationPhotoUrl: string | null
    loraModel: { status: string; progress: number } | null
    referencePhotos: { id: string; photoUrl: string }[]
    generatedPhotos: { id: string; status: string; restoredUrl: string | null; rawUrl: string | null; similarityScore: number | null }[]
  }[]
}

export default function EnsaioDetailPage() {
  const params = useParams()
  const ensaioId = params.id as string
  const [ensaio, setEnsaio] = useState<Ensaio | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchEnsaio = useCallback(async () => {
    try {
      const res = await fetch(`/api/ensaios`)
      const ensaios = await res.json()
      const found = ensaios.find((e: any) => e.id === ensaioId)
      if (found) setEnsaio(found)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [ensaioId])

  useEffect(() => {
    fetchEnsaio()
  }, [fetchEnsaio])

  const copyInviteLink = () => {
    if (!ensaio) return
    const url = `${window.location.origin}/invite/${ensaio.inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const triggerTraining = async (clientId: string) => {
    setActionLoading(`train-${clientId}`)
    try {
      const res = await fetch(`/api/ensaios/${ensaioId}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Erro ao iniciar treino')
      } else {
        alert('Treino iniciado! Acompanhe o progresso.')
        fetchEnsaio()
      }
    } finally {
      setActionLoading(null)
    }
  }

  const triggerGeneration = async (clientId: string) => {
    setActionLoading(`gen-${clientId}`)
    try {
      const res = await fetch(`/api/ensaios/${ensaioId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Erro ao iniciar geracao')
      } else {
        alert('Geracao iniciada! Acompanhe o progresso.')
        fetchEnsaio()
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="text-center py-20 text-white/30">Carregando...</div>
  if (!ensaio) return <div className="text-center py-20 text-white/30">Ensaio nao encontrado</div>

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${ensaio.inviteCode}`

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="font-display text-3xl font-normal">
          {ensaio.name}
        </h2>
        {ensaio.description && <p className="text-sm text-white/35 mt-1">{ensaio.description}</p>}
      </div>

      {/* Link de convite */}
      <div className="p-4 bg-gold-400/[0.04] border border-gold-400/10 rounded-xl mb-8">
        <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Link de Convite</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 text-sm text-gold-400 bg-white/[0.04] px-3 py-2 rounded-lg overflow-hidden text-ellipsis">
            {inviteUrl}
          </code>
          <button
            onClick={copyInviteLink}
            className="px-4 py-2 bg-gold-400 text-studio-bg rounded-lg text-xs font-semibold hover:bg-gold-300 transition"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Upload de Templates */}
      <div className="mb-8">
        <h3 className="font-display text-xl mb-4">Fotos do <span className="text-gold-400 italic">Ensaio</span></h3>
        <PhotoUploader
          ensaioId={ensaioId}
          type="templates"
          maxFiles={50}
          onUploadComplete={fetchEnsaio}
        />
        {ensaio.templatePhotos.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mt-4">
            {ensaio.templatePhotos.map((photo) => (
              <div key={photo.id} className="aspect-[3/4] rounded-lg bg-white/[0.04] border border-gold-400/10 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center text-xs text-white/30">
                  #{photo.order + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clientes */}
      <div>
        <h3 className="font-display text-xl mb-4">Clientes</h3>
        {ensaio.clients.length === 0 ? (
          <p className="text-sm text-white/30">Nenhum cliente conectado. Compartilhe o link de convite.</p>
        ) : (
          <div className="space-y-4">
            {ensaio.clients.map((client) => {
              const trainingStatus = client.loraModel?.status
              const canTrain = client.referencePhotos?.length > 0 && trainingStatus !== 'completed' && trainingStatus !== 'processing'
              const canGenerate = trainingStatus === 'completed' && ensaio.templatePhotos.length > 0

              return (
                <div key={client.id} className="p-5 bg-white/[0.03] border border-gold-400/10 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-[#f0ece4]">{client.user.name}</p>
                      <p className="text-xs text-white/30">{client.user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      {canTrain && (
                        <button
                          onClick={() => triggerTraining(client.id)}
                          disabled={actionLoading === `train-${client.id}`}
                          className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold hover:bg-blue-500/30 transition disabled:opacity-50"
                        >
                          {actionLoading === `train-${client.id}` ? 'Iniciando...' : 'Treinar IA'}
                        </button>
                      )}
                      {canGenerate && (
                        <button
                          onClick={() => triggerGeneration(client.id)}
                          disabled={actionLoading === `gen-${client.id}`}
                          className="px-4 py-2 bg-gold-400 text-studio-bg rounded-lg text-xs font-semibold hover:bg-gold-300 transition disabled:opacity-50"
                        >
                          {actionLoading === `gen-${client.id}` ? 'Iniciando...' : 'Gerar Fotos'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-white/30">
                    <span>{client.referencePhotos?.length || 0} fotos ref</span>
                    <span>{client.inspirationPhotoUrl ? '1 inspiracao' : 'Sem inspiracao'}</span>
                    {trainingStatus && (
                      <span className={
                        trainingStatus === 'completed' ? 'text-green-400' :
                        trainingStatus === 'processing' ? 'text-blue-400' :
                        trainingStatus === 'failed' ? 'text-red-400' : 'text-white/30'
                      }>
                        LoRA: {trainingStatus === 'completed' ? 'Treinado' : trainingStatus === 'processing' ? `Treinando ${client.loraModel?.progress || 0}%` : trainingStatus}
                      </span>
                    )}
                    <span>{client.generatedPhotos?.length || 0} fotos geradas</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
