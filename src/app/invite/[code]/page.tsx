'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser, SignInButton } from '@clerk/nextjs'
import PhotoUploader from '@/components/PhotoUploader'

interface EnsaioInfo {
  id: string
  name: string
  description: string | null
  photographer: { name: string }
  templateCount: number
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const code = params.code as string

  const [ensaio, setEnsaio] = useState<EnsaioInfo | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'info' | 'references' | 'inspiration' | 'done'>('info')

  useEffect(() => {
    fetch(`/api/invite/${code}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Convite invalido')
        return r.json()
      })
      .then((data) => {
        setEnsaio(data.ensaio)
        if (data.clientId) setClientId(data.clientId)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [code])

  const joinEnsaio = async () => {
    setJoining(true)
    try {
      const res = await fetch(`/api/invite/${code}/join`, { method: 'POST' })
      if (!res.ok) throw new Error('Erro ao entrar no ensaio')
      const data = await res.json()
      setClientId(data.clientId)
      setStep('references')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setJoining(false)
    }
  }

  if (!isLoaded || loading) {
    return <div className="min-h-screen flex items-center justify-center text-white/30">Carregando...</div>
  }

  if (error || !ensaio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔗</div>
          <p className="text-white/40">{error || 'Convite nao encontrado'}</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="font-display text-3xl text-gold-400 mb-2">STUDIO</h1>
          <h2 className="font-display text-2xl mb-2">{ensaio.name}</h2>
          <p className="text-sm text-white/35 mb-6">
            {ensaio.photographer.name} convidou voce para este ensaio fotografico com IA.
          </p>
          <SignInButton mode="modal">
            <button className="px-8 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition">
              Entrar para participar
            </button>
          </SignInButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gold-400/10 px-6 py-4">
        <h1 className="font-display text-xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
      </header>

      <main className="max-w-xl mx-auto px-5 py-10">
        {step === 'info' && (
          <div className="text-center">
            <h2 className="font-display text-3xl mb-2">{ensaio.name}</h2>
            <p className="text-sm text-white/35 mb-2">por {ensaio.photographer.name}</p>
            {ensaio.description && <p className="text-sm text-white/40 mb-6">{ensaio.description}</p>}
            <p className="text-sm text-white/35 mb-8">{ensaio.templateCount} fotos no ensaio</p>

            {clientId ? (
              <button
                onClick={() => setStep('references')}
                className="px-8 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
              >
                Continuar Upload
              </button>
            ) : (
              <button
                onClick={joinEnsaio}
                disabled={joining}
                className="px-8 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition disabled:opacity-50"
              >
                {joining ? 'Entrando...' : 'Participar do Ensaio'}
              </button>
            )}
          </div>
        )}

        {step === 'references' && clientId && (
          <div>
            <h2 className="font-display text-2xl mb-2 text-center">
              Fotos de <span className="text-gold-400 italic">Referencia</span>
            </h2>
            <p className="text-sm text-white/35 mb-6 text-center">
              Envie 1 a 12 fotos suas com rosto bem visivel e iluminado.
              Quanto mais fotos, melhor o resultado.
            </p>

            <PhotoUploader
              ensaioId={ensaio.id}
              clientId={clientId}
              type="references"
              maxFiles={12}
              onUploadComplete={() => {}}
            />

            <button
              onClick={() => setStep('inspiration')}
              className="w-full mt-6 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
            >
              Proximo: Foto de Inspiracao
            </button>
          </div>
        )}

        {step === 'inspiration' && clientId && (
          <div>
            <h2 className="font-display text-2xl mb-2 text-center">
              Foto de <span className="text-gold-400 italic">Inspiracao</span>
            </h2>
            <p className="text-sm text-white/35 mb-6 text-center">
              Envie uma foto que represente o estilo e mood desejado para o ensaio (opcional).
            </p>

            <PhotoUploader
              ensaioId={ensaio.id}
              clientId={clientId}
              type="inspiration"
              maxFiles={1}
              onUploadComplete={() => {}}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('done')}
                className="flex-1 py-4 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition"
              >
                Concluir
              </button>
              <button
                onClick={() => setStep('done')}
                className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition"
              >
                Pular
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-10">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="font-display text-2xl mb-2">Tudo pronto!</h2>
            <p className="text-sm text-white/35 mb-6">
              Suas fotos foram enviadas. O fotografo vai processar seu ensaio e voce sera notificado quando estiver pronto.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
