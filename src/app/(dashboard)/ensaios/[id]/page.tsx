'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PhotoUploader from '@/components/PhotoUploader'

interface Ensaio {
  id: string
  name: string
  description: string | null
  status: string
  inspirationPhotoUrl: string | null
  prompts: string[]
  photosPerPrompt: number
  referencePhotos: { id: string; photoUrl: string; order: number }[]
  loraModel: { status: string; progress: number; errorMessage: string | null } | null
  generatedPhotos: { id: string; status: string; prompt: string; restoredUrl: string | null; rawUrl: string | null; similarityScore: number | null }[]
}

export default function EnsaioDetailPage() {
  const params = useParams()
  const ensaioId = params.id as string
  const [ensaio, setEnsaio] = useState<Ensaio | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newPrompt, setNewPrompt] = useState('')
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const fetchEnsaio = useCallback(async () => {
    try {
      const res = await fetch(`/api/ensaios/${ensaioId}`)
      if (res.ok) setEnsaio(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [ensaioId])

  useEffect(() => { fetchEnsaio() }, [fetchEnsaio])

  // Auto-refresh quando processando
  useEffect(() => {
    const isActive = ensaio?.status === 'training' || ensaio?.status === 'generating' ||
      ensaio?.loraModel?.status === 'processing' ||
      ensaio?.generatedPhotos.some(p => ['generating', 'upscaling', 'restoring', 'scoring'].includes(p.status))

    if (isActive) {
      pollingRef.current = setInterval(fetchEnsaio, 5000)
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [ensaio?.status, ensaio?.loraModel?.status, ensaio?.generatedPhotos, fetchEnsaio])

  const triggerAction = async (action: 'train' | 'generate') => {
    setActionLoading(action)
    try {
      const res = await fetch(`/api/ensaios/${ensaioId}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) alert(data.error || `Erro ao ${action}`)
      else fetchEnsaio()
    } finally {
      setActionLoading(null)
    }
  }

  const addPrompt = async () => {
    if (!newPrompt.trim() || !ensaio) return
    const updatedPrompts = [...ensaio.prompts, newPrompt.trim()]
    await fetch(`/api/ensaios/${ensaioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: updatedPrompts }),
    })
    setNewPrompt('')
    fetchEnsaio()
  }

  const removePrompt = async (index: number) => {
    if (!ensaio) return
    const updatedPrompts = ensaio.prompts.filter((_, i) => i !== index)
    await fetch(`/api/ensaios/${ensaioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: updatedPrompts }),
    })
    fetchEnsaio()
  }

  if (loading) return <div className="text-center py-20 text-white/30">Carregando...</div>
  if (!ensaio) return <div className="text-center py-20 text-white/30">Ensaio nao encontrado</div>

  const canTrain = ensaio.referencePhotos.length > 0 && ensaio.loraModel?.status !== 'completed' && ensaio.loraModel?.status !== 'processing'
  const canGenerate = ensaio.loraModel?.status === 'completed' && ensaio.prompts.length > 0
  const pendingReview = ensaio.generatedPhotos.filter(p => p.status === 'pending_review').length
  const totalToGenerate = ensaio.prompts.length * ensaio.photosPerPrompt

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/ensaios" className="text-xs text-white/30 hover:text-gold-400 transition mb-1 inline-block">← Voltar</Link>
          <h2 className="font-display text-3xl font-normal">{ensaio.name}</h2>
          {ensaio.description && <p className="text-sm text-white/35 mt-1">{ensaio.description}</p>}
        </div>
        <div className="flex gap-2">
          {canTrain && (
            <button onClick={() => triggerAction('train')} disabled={!!actionLoading}
              className="px-5 py-2.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-semibold hover:bg-blue-500/30 transition disabled:opacity-50">
              {actionLoading === 'train' ? 'Iniciando...' : `Treinar IA (${ensaio.referencePhotos.length} refs)`}
            </button>
          )}
          {canGenerate && (
            <button onClick={() => triggerAction('generate')} disabled={!!actionLoading}
              className="px-5 py-2.5 bg-gold-400 text-studio-bg rounded-xl text-xs font-semibold hover:bg-gold-300 transition disabled:opacity-50">
              {actionLoading === 'generate' ? 'Iniciando...' : `Gerar ${totalToGenerate} Fotos`}
            </button>
          )}
          {pendingReview > 0 && (
            <Link href={`/ensaios/${ensaio.id}/review`}
              className="px-5 py-2.5 bg-gold-400/20 text-gold-400 border border-gold-400/30 rounded-xl text-xs font-semibold hover:bg-gold-400/30 transition">
              Revisar ({pendingReview})
            </Link>
          )}
        </div>
      </div>

      {/* Status do LoRA */}
      {ensaio.loraModel && (
        <div className={`p-4 rounded-xl mb-6 border ${
          ensaio.loraModel.status === 'completed' ? 'bg-green-500/[0.06] border-green-500/20' :
          ensaio.loraModel.status === 'processing' ? 'bg-blue-500/[0.06] border-blue-500/20' :
          ensaio.loraModel.status === 'failed' ? 'bg-red-500/[0.06] border-red-500/20' :
          'bg-white/[0.03] border-white/10'
        }`}>
          <span className="text-xs font-semibold">
            {ensaio.loraModel.status === 'completed' ? '✅ LoRA treinado — pronto para gerar' :
             ensaio.loraModel.status === 'processing' ? `⏳ Treinando IA... ${ensaio.loraModel.progress}%` :
             ensaio.loraModel.status === 'failed' ? `❌ Erro: ${ensaio.loraModel.errorMessage}` :
             '⏸ Aguardando treino'}
          </span>
          {ensaio.loraModel.status === 'processing' && (
            <div className="mt-2 w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${ensaio.loraModel.progress}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-8 mb-8">
        {/* 1. Fotos de Referencia */}
        <section>
          <h3 className="font-display text-lg mb-3">
            1. Fotos de <span className="text-gold-400 italic">Referencia</span>
            <span className="text-xs text-white/30 ml-2">({ensaio.referencePhotos.length}/12)</span>
          </h3>
          <p className="text-xs text-white/30 mb-3">Fotos do rosto do cliente. Quanto mais variadas (angulos, luz), melhor o resultado.</p>
          {ensaio.referencePhotos.length > 0 && (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2 mb-3">
              {ensaio.referencePhotos.map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-green-500/[0.08] border border-green-500/20 flex items-center justify-center text-[10px] text-green-400">
                  ✓
                </div>
              ))}
            </div>
          )}
          {ensaio.referencePhotos.length < 12 && (
            <PhotoUploader ensaioId={ensaioId} type="references" maxFiles={12 - ensaio.referencePhotos.length} onUploadComplete={fetchEnsaio} />
          )}
        </section>

        {/* 2. Foto de Inspiracao */}
        <section>
          <h3 className="font-display text-lg mb-3">
            2. Foto de <span className="text-gold-400 italic">Inspiracao</span>
            <span className="text-xs text-white/30 ml-2">(opcional)</span>
          </h3>
          <p className="text-xs text-white/30 mb-3">Define o estilo, mood e estetica das fotos geradas.</p>
          {ensaio.inspirationPhotoUrl ? (
            <div className="inline-block px-4 py-2 bg-green-500/[0.06] border border-green-500/20 rounded-xl text-xs text-green-400">
              ✅ Foto de inspiracao enviada
            </div>
          ) : (
            <PhotoUploader ensaioId={ensaioId} type="inspiration" maxFiles={1} onUploadComplete={fetchEnsaio} />
          )}
        </section>

        {/* 3. Prompts de Geracao */}
        <section>
          <h3 className="font-display text-lg mb-3">
            3. Descricao das <span className="text-gold-400 italic">Fotos</span>
            <span className="text-xs text-white/30 ml-2">({ensaio.prompts.length} prompts)</span>
          </h3>
          <p className="text-xs text-white/30 mb-3">Descreva cada foto que quer gerar. Cada descricao gera uma foto diferente.</p>

          {/* Lista de prompts existentes */}
          {ensaio.prompts.length > 0 && (
            <div className="space-y-2 mb-4">
              {ensaio.prompts.map((prompt, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-gold-400/10 rounded-xl">
                  <span className="text-xs text-gold-400 font-semibold w-6">{i + 1}.</span>
                  <span className="text-sm text-[#f0ece4] flex-1">{prompt}</span>
                  <button onClick={() => removePrompt(i)} className="text-xs text-red-400/50 hover:text-red-400 transition">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar novo prompt */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPrompt()}
              placeholder="Ex: ensaio gestante, vestido branco, luz natural, jardim botanico"
              className="flex-1 px-4 py-3 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-[#f0ece4] outline-none focus:border-gold-400/50 transition"
            />
            <button onClick={addPrompt} disabled={!newPrompt.trim()}
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition ${newPrompt.trim() ? 'bg-gold-400 text-studio-bg hover:bg-gold-300' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}>
              Adicionar
            </button>
          </div>

          {/* Exemplos */}
          {ensaio.prompts.length === 0 && (
            <div className="mt-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
              <p className="text-xs text-white/25 mb-2">Exemplos de prompts:</p>
              <div className="space-y-1 text-xs text-white/20">
                <p>• ensaio gestante, vestido fluido, luz dourada, campo de flores</p>
                <p>• retrato profissional, fundo escuro, iluminacao rembrandt</p>
                <p>• ensaio newborn, tons pasteis, cobertor bege, close do rosto</p>
                <p>• foto editorial, roupa elegante, cenario urbano, golden hour</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Fotos Geradas */}
      {ensaio.generatedPhotos.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg">
              Fotos <span className="text-gold-400 italic">Geradas</span>
              <span className="text-xs text-white/30 ml-2">({ensaio.generatedPhotos.length})</span>
            </h3>
            {pendingReview > 0 && (
              <Link href={`/ensaios/${ensaio.id}/review`} className="text-xs text-gold-400 hover:text-gold-300 transition">
                Revisar todas →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {ensaio.generatedPhotos.map((photo) => {
              const imgSrc = photo.restoredUrl || photo.rawUrl
              const isProcessing = ['generating', 'upscaling', 'restoring', 'scoring'].includes(photo.status)
              return (
                <div key={photo.id} className="aspect-[3/4] rounded-xl bg-white/[0.04] border border-gold-400/10 overflow-hidden relative">
                  {imgSrc ? (
                    <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      {isProcessing && <div className="w-6 h-6 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin" />}
                      <span className="text-[10px] text-white/30">{photo.status}</span>
                    </div>
                  )}
                  <div className={`absolute bottom-0 left-0 right-0 py-1.5 text-center text-[10px] font-semibold ${
                    photo.status === 'approved' ? 'bg-green-500/80' :
                    photo.status === 'rejected' ? 'bg-red-500/80' :
                    photo.status === 'pending_review' ? 'bg-gold-400/80 text-studio-bg' :
                    isProcessing ? 'bg-blue-500/50' : 'bg-black/50'
                  }`}>
                    {photo.status === 'approved' ? 'Aprovada' :
                     photo.status === 'rejected' ? 'Rejeitada' :
                     photo.status === 'pending_review' ? 'Revisar' :
                     isProcessing ? 'Processando...' : photo.status}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
