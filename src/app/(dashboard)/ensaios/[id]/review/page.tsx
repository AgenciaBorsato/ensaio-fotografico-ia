'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface GeneratedPhoto {
  id: string
  status: string
  rawUrl: string | null
  upscaledUrl: string | null
  restoredUrl: string | null
  similarityScore: number | null
  attempt: number
  notes: string | null
  prompt: string
}

interface Ensaio {
  id: string
  name: string
  generatedPhotos: GeneratedPhoto[]
}

export default function ReviewPage() {
  const params = useParams()
  const ensaioId = params.id as string
  const [ensaio, setEnsaio] = useState<Ensaio | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<GeneratedPhoto | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchEnsaio = useCallback(async () => {
    const res = await fetch(`/api/ensaios/${ensaioId}`)
    if (res.ok) setEnsaio(await res.json())
    setLoading(false)
  }, [ensaioId])

  useEffect(() => { fetchEnsaio() }, [fetchEnsaio])

  const handleAction = async (photoId: string, action: 'approve' | 'reject') => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/ensaios/${ensaioId}/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        fetchEnsaio()
        setSelectedPhoto(null)
      }
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="text-center py-20 text-white/30">Carregando...</div>
  if (!ensaio) return <div className="text-center py-20 text-white/30">Nao encontrado</div>

  const reviewable = ensaio.generatedPhotos.filter(p =>
    ['pending_review', 'approved', 'rejected'].includes(p.status)
  )
  const pending = reviewable.filter(p => p.status === 'pending_review')
  const approved = reviewable.filter(p => p.status === 'approved')
  const rejected = reviewable.filter(p => p.status === 'rejected')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/ensaios/${ensaioId}`} className="text-xs text-white/30 hover:text-gold-400 transition mb-1 inline-block">← Voltar ao ensaio</Link>
          <h2 className="font-display text-3xl font-normal">
            Revisao: <span className="text-gold-400 italic">{ensaio.name}</span>
          </h2>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-gold-400">{pending.length} pendentes</span>
          <span className="text-green-400">{approved.length} aprovadas</span>
          <span className="text-red-400">{rejected.length} rejeitadas</span>
        </div>
      </div>

      {/* Fotos pendentes de revisao */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm text-white/50 uppercase tracking-wider mb-3">Pendentes de revisao</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {pending.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} onSelect={setSelectedPhoto} />
            ))}
          </div>
        </section>
      )}

      {/* Aprovadas */}
      {approved.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm text-white/50 uppercase tracking-wider mb-3">Aprovadas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {approved.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} onSelect={setSelectedPhoto} />
            ))}
          </div>
        </section>
      )}

      {/* Rejeitadas */}
      {rejected.length > 0 && (
        <section className="mb-8 opacity-60">
          <h3 className="text-sm text-white/50 uppercase tracking-wider mb-3">Rejeitadas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {rejected.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} onSelect={setSelectedPhoto} />
            ))}
          </div>
        </section>
      )}

      {reviewable.length === 0 && (
        <div className="text-center py-20 text-white/30">Nenhuma foto para revisar ainda</div>
      )}

      {/* Modal de revisao */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="bg-studio-bg border border-gold-400/15 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex gap-6">
                {/* Imagem */}
                <div className="flex-1">
                  <img
                    src={selectedPhoto.restoredUrl || selectedPhoto.upscaledUrl || selectedPhoto.rawUrl || ''}
                    alt=""
                    className="w-full rounded-xl border border-gold-400/10"
                  />
                </div>

                {/* Info + acoes */}
                <div className="w-64 flex flex-col gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Prompt:</p>
                    <p className="text-xs text-white/50 italic">{selectedPhoto.prompt}</p>
                  </div>

                  {selectedPhoto.similarityScore != null && (
                    <div className="px-3 py-2 bg-white/[0.04] rounded-lg">
                      <p className="text-xs text-white/40">Semelhanca</p>
                      <p className={`text-2xl font-bold ${selectedPhoto.similarityScore >= 90 ? 'text-green-400' : selectedPhoto.similarityScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Math.round(selectedPhoto.similarityScore)}%
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-white/30">
                    <p>Tentativa: {selectedPhoto.attempt}/3</p>
                    <p>Status: {selectedPhoto.status}</p>
                  </div>

                  {/* Versoes da imagem */}
                  <div className="space-y-1">
                    <p className="text-xs text-white/40">Versoes:</p>
                    {selectedPhoto.rawUrl && (
                      <a href={selectedPhoto.rawUrl} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:text-blue-300 block">Raw</a>
                    )}
                    {selectedPhoto.upscaledUrl && (
                      <a href={selectedPhoto.upscaledUrl} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:text-blue-300 block">Upscaled</a>
                    )}
                    {selectedPhoto.restoredUrl && (
                      <a href={selectedPhoto.restoredUrl} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:text-blue-300 block">Restaurada (final)</a>
                    )}
                  </div>

                  {/* Acoes */}
                  <div className="flex flex-col gap-2 mt-auto">
                    {selectedPhoto.status === 'pending_review' && (
                      <>
                        <button
                          onClick={() => handleAction(selectedPhoto.id, 'approve')}
                          disabled={actionLoading}
                          className="w-full py-3 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-sm font-semibold hover:bg-green-500/30 transition disabled:opacity-50"
                        >
                          ✅ Aprovar
                        </button>
                        <button
                          onClick={() => handleAction(selectedPhoto.id, 'reject')}
                          disabled={actionLoading}
                          className="w-full py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-semibold hover:bg-red-500/30 transition disabled:opacity-50"
                        >
                          ❌ Rejeitar
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSelectedPhoto(null)}
                      className="w-full py-3 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoCard({ photo, onSelect }: { photo: GeneratedPhoto; onSelect: (p: GeneratedPhoto) => void }) {
  const imgSrc = photo.restoredUrl || photo.upscaledUrl || photo.rawUrl
  return (
    <div
      onClick={() => onSelect(photo)}
      className="aspect-[3/4] rounded-xl bg-white/[0.04] border border-gold-400/10 overflow-hidden relative cursor-pointer hover:border-gold-400/30 transition group"
    >
      {imgSrc ? (
        <img src={imgSrc} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-white/30">{photo.status}</div>
      )}
      <div className={`absolute bottom-0 left-0 right-0 py-1.5 text-center text-[10px] font-semibold ${
        photo.status === 'approved' ? 'bg-green-500/80' :
        photo.status === 'rejected' ? 'bg-red-500/80' :
        'bg-gold-400/80 text-studio-bg'
      }`}>
        {photo.status === 'approved' ? 'Aprovada' : photo.status === 'rejected' ? 'Rejeitada' : 'Revisar'}
      </div>
    </div>
  )
}
