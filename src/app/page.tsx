'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

const STEPS = { REFERENCE: 0, TARGET: 1, PROCESSING: 2, RESULT: 3 } as const
type Step = typeof STEPS[keyof typeof STEPS]
type Quality = 'fast' | 'premium'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_DIMENSION = 2048

function resizeImage(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.onerror = () => reject(new Error('Erro ao carregar imagem'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

async function pollPrediction(id: string, apiKey: string, onProgress: (p: number) => void): Promise<string> {
  let status = 'starting'
  let output: any = null
  let count = 0
  while (status !== 'succeeded' && status !== 'failed' && count < 120) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`/api/replicate/status?id=${id}&apiKey=${encodeURIComponent(apiKey)}`)
    const data = await res.json()
    status = data.status
    output = data.output
    count++
    onProgress(count)
  }
  if (status === 'failed') throw new Error('Falha no processamento')
  return typeof output === 'string' ? output : output?.[0] || output
}

export default function StudioPage() {
  const [step, setStep] = useState<Step>(STEPS.REFERENCE)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [targetFile, setTargetFile] = useState<File | null>(null)
  const [targetPreview, setTargetPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [quality, setQuality] = useState<Quality>('premium')
  const refInputRef = useRef<HTMLInputElement>(null)
  const targetInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('replicate_key')
    if (saved) setApiKey(saved)
  }, [])

  useEffect(() => {
    return () => {
      if (referencePreview) URL.revokeObjectURL(referencePreview)
      if (targetPreview) URL.revokeObjectURL(targetPreview)
    }
  }, [referencePreview, targetPreview])

  const handleReference = useCallback((files: FileList | File[]) => {
    const file = Array.from(files).find(f => f.type.startsWith('image/'))
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) { setError('Imagem muito grande. Maximo 5MB.'); return }
    if (referencePreview) URL.revokeObjectURL(referencePreview)
    setReferenceFile(file)
    setReferencePreview(URL.createObjectURL(file))
    setError(null)
  }, [referencePreview])

  const handleTarget = useCallback((files: FileList | File[]) => {
    const file = Array.from(files).find(f => f.type.startsWith('image/'))
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) { setError('Imagem muito grande. Maximo 5MB.'); return }
    if (targetPreview) URL.revokeObjectURL(targetPreview)
    setTargetFile(file)
    setTargetPreview(URL.createObjectURL(file))
    setError(null)
  }, [targetPreview])

  const processSwap = async () => {
    if (!apiKey) { setShowConfig(true); setError('Configure sua API Key primeiro.'); return }
    if (!referenceFile || !targetFile) return

    setStep(STEPS.PROCESSING)
    setProcessing(true)
    setProgress(0)
    setError(null)
    setStatusText('Preparando imagens...')

    try {
      setProgress(5)
      const [sourceBase64, targetBase64] = await Promise.all([
        resizeImage(referenceFile, MAX_DIMENSION),
        resizeImage(targetFile, MAX_DIMENSION),
      ])
      setProgress(15)
      setStatusText(quality === 'premium' ? 'Processando face swap premium...' : 'Processando face swap...')

      // Etapa 1: Face swap
      const res = await fetch('/api/replicate/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBase64, targetBase64, apiKey, quality }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar')

      let finalUrl = await pollPrediction(data.id, apiKey, (count) => {
        setProgress(Math.min(15 + count * 1.5, quality === 'premium' ? 50 : 90))
      })

      // Etapa 2: Restauracao facial (modo rapido tambem ganha restauracao agora)
      if (finalUrl) {
        setStatusText('Aprimorando detalhes faciais...')
        setProgress(quality === 'premium' ? 55 : 92)

        try {
          const restoreRes = await fetch('/api/replicate/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: finalUrl, apiKey }),
          })
          const restoreData = await restoreRes.json()

          if (restoreRes.ok && restoreData.id) {
            setStatusText('Refinando pele, iluminacao e detalhes...')
            const restoredUrl = await pollPrediction(restoreData.id, apiKey, (count) => {
              setProgress(Math.min((quality === 'premium' ? 55 : 92) + count, 95))
            })
            if (restoredUrl) finalUrl = restoredUrl
          }
        } catch {
          // Restauracao falhou, usa resultado do swap direto
          console.warn('Restauracao facial falhou, usando resultado direto')
        }
      }

      setProgress(100)
      setStatusText('Pronto!')
      setResult(finalUrl)
      setStep(STEPS.RESULT)
    } catch (err: any) {
      setError(err.message)
      setStep(STEPS.TARGET)
    } finally {
      setProcessing(false)
    }
  }

  const reset = () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview)
    if (targetPreview) URL.revokeObjectURL(targetPreview)
    setStep(STEPS.REFERENCE)
    setReferenceFile(null)
    setReferencePreview(null)
    setTargetFile(null)
    setTargetPreview(null)
    setResult(null)
    setProgress(0)
    setStatusText('')
    setError(null)
  }

  const saveApiKey = () => {
    localStorage.setItem('replicate_key', apiKey)
    setShowConfig(false)
  }

  const stepLabels = ['Referencia', 'Modelo', 'Processando', 'Resultado']

  return (
    <div className="relative">
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.03) 0%, transparent 70%), radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.02) 0%, transparent 60%)' }} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-gold-400/10">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
          <p className="text-[10px] text-white/30 tracking-[4px] uppercase">Ensaio Fotografico com IA</p>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-white/50 border border-gold-400/20 rounded-lg px-4 py-2 hover:border-gold-400/40 transition">Config</button>
      </header>

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="bg-studio-card border border-gold-400/15 rounded-2xl p-8 w-full max-w-md">
            <h3 className="font-display text-xl text-gold-400 mb-2">Configuracao</h3>
            <p className="text-sm text-white/40 mb-6">Insira sua API Key do Replicate.</p>
            <label className="text-xs text-white/50 block mb-1.5">REPLICATE API TOKEN</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="r8_xxxxxxxxxxxxxxxx" className="w-full px-4 py-3 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-[#f0ece4] outline-none focus:border-gold-400/50 transition" />
            <p className="text-[11px] text-white/25 mt-3 mb-6 leading-relaxed">Crie sua conta em replicate.com e copie o token em Settings &gt; API Tokens.</p>
            <div className="flex gap-3">
              <button onClick={saveApiKey} className="flex-1 py-3 bg-gold-400 text-studio-bg rounded-xl text-sm font-semibold hover:bg-gold-300 transition">Salvar</button>
              <button onClick={() => setShowConfig(false)} className="py-3 px-5 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition">Fechar</button>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-[1] max-w-xl mx-auto px-5 pt-10 pb-24">
        <div className="flex justify-center gap-2 mb-10">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= i ? 'bg-gold-400 text-studio-bg' : 'bg-white/[0.06] text-white/30'}`}>{step > i ? '\u2713' : i + 1}</div>
              <span className={`text-xs hidden sm:inline transition-colors ${step >= i ? 'text-gold-400' : 'text-white/30'}`}>{label}</span>
              {i < 3 && <div className={`w-6 h-px transition-colors ${step > i ? 'bg-gold-400' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-300">{error}</div>}

        {step === STEPS.REFERENCE && (
          <div>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-normal mb-2">Foto de <span className="text-gold-400 italic">Referencia</span></h2>
              <p className="text-sm text-white/35 leading-relaxed">Envie uma foto da pessoa que sera o rosto no ensaio.<br />Rosto bem visivel e iluminado.</p>
            </div>
            <div onClick={() => refInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleReference(e.dataTransfer.files) }} className="border-2 border-dashed border-gold-400/30 hover:border-gold-400/60 rounded-2xl py-12 px-8 text-center cursor-pointer transition-all hover:bg-gold-400/[0.02]">
              <div className="text-5xl mb-4 opacity-70">\ud83d\udc64</div>
              <p className="font-display text-lg text-gold-400 font-semibold mb-1">Arraste a foto de referencia aqui</p>
              <p className="text-xs text-white/40">JPG, PNG ou WEBP - Maximo 5MB - Rosto bem visivel</p>
              <input ref={refInputRef} type="file" accept="image/*" onChange={e => e.target.files && handleReference(e.target.files)} className="hidden" />
            </div>
            {referencePreview && (
              <div className="mt-6 flex justify-center">
                <div className="relative">
                  <img src={referencePreview} alt="" className="w-24 h-24 object-cover rounded-xl border border-gold-400/20" />
                  <button onClick={() => { if (referencePreview) URL.revokeObjectURL(referencePreview); setReferenceFile(null); setReferencePreview(null) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-studio-bg border border-gold-400/40 text-gold-400 text-[10px] flex items-center justify-center hover:bg-gold-400 hover:text-studio-bg transition">x</button>
                </div>
              </div>
            )}
            <button onClick={() => referenceFile && setStep(STEPS.TARGET)} disabled={!referenceFile} className={`w-full mt-8 py-4 rounded-xl text-sm font-semibold tracking-wide transition-all ${referenceFile ? 'bg-gold-400 text-studio-bg hover:bg-gold-300 cursor-pointer' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}>Proximo</button>
          </div>
        )}

        {step === STEPS.TARGET && (
          <div>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-normal mb-2">Foto <span className="text-gold-400 italic">Modelo</span></h2>
              <p className="text-sm text-white/35 leading-relaxed">Envie a foto com a pose e cenario desejados.<br />O rosto sera substituido pelo da referencia.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-gold-400/[0.04] border border-gold-400/10 rounded-xl mb-6">
              {referencePreview && <img src={referencePreview} alt="" className="w-9 h-9 rounded-lg object-cover border border-gold-400/20" />}
              <span className="text-xs text-white/40">1 foto de referencia</span>
              <button onClick={() => setStep(STEPS.REFERENCE)} className="ml-auto text-xs text-gold-400 hover:text-gold-300 transition">Editar</button>
            </div>

            {/* Seletor de Qualidade */}
            <div className="mb-6 p-4 rounded-xl border border-gold-400/10 bg-gold-400/[0.02]">
              <p className="text-xs text-white/50 font-semibold mb-3 uppercase tracking-wider">Qualidade</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setQuality('fast')} className={`py-3 px-4 rounded-lg text-xs font-semibold transition-all ${quality === 'fast' ? 'bg-white/10 text-white border border-white/20' : 'bg-transparent text-white/40 border border-transparent hover:border-white/10'}`}>
                  <div className="text-sm mb-0.5">Rapido</div>
                  <div className="text-[10px] opacity-60">Face swap + restauracao</div>
                </button>
                <button onClick={() => setQuality('premium')} className={`py-3 px-4 rounded-lg text-xs font-semibold transition-all ${quality === 'premium' ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40' : 'bg-transparent text-white/40 border border-transparent hover:border-gold-400/20'}`}>
                  <div className="text-sm mb-0.5">Premium</div>
                  <div className="text-[10px] opacity-60">FaceFusion + CodeFormer</div>
                </button>
              </div>
            </div>

            {!targetPreview ? (
              <div onClick={() => targetInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleTarget(e.dataTransfer.files) }} className="border-2 border-dashed border-gold-400/30 hover:border-gold-400/60 rounded-2xl py-12 px-8 text-center cursor-pointer transition-all hover:bg-gold-400/[0.02]">
                <div className="text-5xl mb-4 opacity-70">\ud83d\udcf8</div>
                <p className="font-display text-lg text-gold-400 font-semibold mb-1">Arraste a foto modelo aqui</p>
                <p className="text-xs text-white/40">A foto com a pose, roupa e cenario desejados</p>
                <input ref={targetInputRef} type="file" accept="image/*" onChange={e => e.target.files && handleTarget(e.target.files)} className="hidden" />
              </div>
            ) : (
              <div className="text-center">
                <div className="relative inline-block">
                  <img src={targetPreview} alt="" className="max-w-full max-h-[360px] rounded-2xl border border-gold-400/15" />
                  <button onClick={() => { if (targetPreview) URL.revokeObjectURL(targetPreview); setTargetFile(null); setTargetPreview(null) }} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/70 border border-gold-400/30 text-gold-400 text-sm flex items-center justify-center hover:bg-gold-400 hover:text-studio-bg transition">x</button>
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep(STEPS.REFERENCE)} className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition">Voltar</button>
              <button onClick={processSwap} disabled={!targetFile} className={`flex-1 py-4 rounded-xl text-sm font-semibold tracking-wide transition-all ${targetFile ? 'bg-gradient-to-br from-gold-400 to-gold-500 text-studio-bg hover:from-gold-300 hover:to-gold-400 cursor-pointer' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}>Gerar Ensaio {quality === 'premium' ? '(Premium)' : ''}</button>
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <div className="text-center pt-10">
            <div className="w-20 h-20 mx-auto mb-8 rounded-full border-2 border-gold-400/15 border-t-gold-400 animate-spin-slow" />
            <h2 className="font-display text-2xl font-normal mb-3">Criando seu <span className="text-gold-400 italic">ensaio</span>...</h2>
            <p className="text-sm text-white/35 mb-2">{statusText}</p>
            {quality === 'premium' && <p className="text-[11px] text-gold-400/50 mb-6">Modo Premium: FaceFusion + CodeFormer</p>}
            <div className="max-w-xs mx-auto">
              <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-gold-400 to-gold-200 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              <p className="text-xs text-white/25 mt-2">{progress}%</p>
            </div>
            <div className="flex justify-center gap-4 mt-10 opacity-40">
              {referencePreview && <img src={referencePreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-gold-400/20" />}
              <div className="flex items-center text-xl text-gold-400">-&gt;</div>
              {targetPreview && <img src={targetPreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-gold-400/20" />}
            </div>
          </div>
        )}

        {step === STEPS.RESULT && result && (
          <div className="text-center">
            <h2 className="font-display text-3xl font-normal mb-2">Seu <span className="text-gold-400 italic">ensaio</span> esta pronto</h2>
            <p className="text-sm text-white/35 mb-8">Imagem gerada com {quality === 'premium' ? 'FaceFusion + CodeFormer' : 'Face Swap + CodeFormer'}</p>
            <div className="rounded-2xl overflow-hidden border border-gold-400/15 mb-8 relative">
              <img src={result} alt="Resultado" className="w-full block" />
              <div className="absolute bottom-4 left-4 flex gap-2 bg-black/70 backdrop-blur-sm px-3 py-2 rounded-xl">
                {referencePreview && <div className="text-center"><img src={referencePreview} alt="" className="w-10 h-10 rounded-lg object-cover" /><p className="text-[9px] text-white/50 mt-1">Ref</p></div>}
                {targetPreview && <div className="text-center"><img src={targetPreview} alt="" className="w-10 h-10 rounded-lg object-cover" /><p className="text-[9px] text-white/50 mt-1">Modelo</p></div>}
              </div>
              {quality === 'premium' && <div className="absolute top-4 right-4 bg-gold-400/90 text-studio-bg text-[10px] font-bold px-2 py-1 rounded-md">PREMIUM</div>}
            </div>
            <div className="flex gap-3">
              <a href={result} download="ensaio-studio.png" target="_blank" rel="noopener noreferrer" className="flex-1 py-4 bg-gradient-to-br from-gold-400 to-gold-500 text-studio-bg rounded-xl text-sm font-semibold text-center hover:from-gold-300 hover:to-gold-400 transition">Baixar Imagem</a>
              <button onClick={reset} className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition">Novo Ensaio</button>
            </div>
          </div>
        )}

        <div className="mt-16 text-center text-[11px] text-white/15 leading-relaxed">
          <p>Powered by Replicate AI</p>
          <p>Face Swap + CodeFormer (restauracao facial)</p>
        </div>
      </main>
    </div>
  )
}
