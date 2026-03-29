'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

const STEPS = { REFERENCE: 0, TARGET: 1, PROCESSING: 2, RESULT: 3 } as const
type Step = typeof STEPS[keyof typeof STEPS]

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

export default function StudioPage() {
  const [step, setStep] = useState<Step>(STEPS.REFERENCE)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [targetFile, setTargetFile] = useState<File | null>(null)
  const [targetPreview, setTargetPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showConfig, setShowConfig] = useState(false)
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
    if (file.size > MAX_IMAGE_SIZE) { setError('Imagem muito grande. Máximo 5MB.'); return }
    if (referencePreview) URL.revokeObjectURL(referencePreview)
    setReferenceFile(file)
    setReferencePreview(URL.createObjectURL(file))
    setError(null)
  }, [referencePreview])

  const handleTarget = useCallback((files: FileList | File[]) => {
    const file = Array.from(files).find(f => f.type.startsWith('image/'))
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) { setError('Imagem muito grande. Máximo 5MB.'); return }
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

    try {
      setProgress(10)
      const [sourceBase64, targetBase64] = await Promise.all([
        resizeImage(referenceFile, MAX_DIMENSION),
        resizeImage(targetFile, MAX_DIMENSION),
      ])
      setProgress(25)

      const res = await fetch('/api/replicate/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBase64, targetBase64, apiKey }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar')

      const predictionId = data.id
      let status = data.status
      let outputUrl = data.output
      let pollCount = 0

      while (status !== 'succeeded' && status !== 'failed' && pollCount < 60) {
        await new Promise(r => setTimeout(r, 2000))
        const pollRes = await fetch(`/api/replicate/status?id=${predictionId}&apiKey=${encodeURIComponent(apiKey)}`)
        const pollData = await pollRes.json()
        status = pollData.status
        outputUrl = pollData.output
        pollCount++
        setProgress(Math.min(25 + pollCount * 2, 90))
      }

      if (status === 'failed') throw new Error('Falha no processamento da imagem')

      setProgress(100)
      setResult(typeof outputUrl === 'string' ? outputUrl : outputUrl?.[0] || outputUrl)
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
    setError(null)
  }

  const saveApiKey = () => {
    localStorage.setItem('replicate_key', apiKey)
    setShowConfig(false)
  }

  const stepLabels = ['Referência', 'Modelo', 'Processando', 'Resultado']

  return (
    <div className="relative">
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.03) 0%, transparent 70%), radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.02) 0%, transparent 60%)' }} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-gold-400/10">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold-400 tracking-wide">STUDIO</h1>
          <p className="text-[10px] text-white/30 tracking-[4px] uppercase">Ensaio Fotográfico com IA</p>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-white/50 border border-gold-400/20 rounded-lg px-4 py-2 hover:border-gold-400/40 transition">⚙ Config</button>
      </header>

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="bg-studio-card border border-gold-400/15 rounded-2xl p-8 w-full max-w-md">
            <h3 className="font-display text-xl text-gold-400 mb-2">Configuração</h3>
            <p className="text-sm text-white/40 mb-6">Insira sua API Key do Replicate.</p>
            <label className="text-xs text-white/50 block mb-1.5">REPLICATE API TOKEN</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="r8_xxxxxxxxxxxxxxxx" className="w-full px-4 py-3 bg-white/[0.04] border border-gold-400/20 rounded-xl text-sm text-[#f0ece4] outline-none focus:border-gold-400/50 transition" />
            <p className="text-[11px] text-white/25 mt-3 mb-6 leading-relaxed">Crie sua conta em replicate.com e copie o token em Settings → API Tokens.</p>
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
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= i ? 'bg-gold-400 text-studio-bg' : 'bg-white/[0.06] text-white/30'}`}>{step > i ? '✓' : i + 1}</div>
              <span className={`text-xs hidden sm:inline transition-colors ${step >= i ? 'text-gold-400' : 'text-white/30'}`}>{label}</span>
              {i < 3 && <div className={`w-6 h-px transition-colors ${step > i ? 'bg-gold-400' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-300">{error}</div>}

        {step === STEPS.REFERENCE && (
          <div>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-normal mb-2">Foto de <span className="text-gold-400 italic">Referência</span></h2>
              <p className="text-sm text-white/35 leading-relaxed">Envie uma foto da pessoa que será o rosto no ensaio.<br />Rosto bem visível e iluminado.</p>
            </div>
            <div onClick={() => refInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleReference(e.dataTransfer.files) }} className="border-2 border-dashed border-gold-400/30 hover:border-gold-400/60 rounded-2xl py-12 px-8 text-center cursor-pointer transition-all hover:bg-gold-400/[0.02]">
              <div className="text-5xl mb-4 opacity-70">👤</div>
              <p className="font-display text-lg text-gold-400 font-semibold mb-1">Arraste a foto de referência aqui</p>
              <p className="text-xs text-white/40">JPG, PNG ou WEBP • Máximo 5MB • Rosto bem visível</p>
              <input ref={refInputRef} type="file" accept="image/*" onChange={e => e.target.files && handleReference(e.target.files)} className="hidden" />
            </div>
            {referencePreview && (
              <div className="mt-6 flex justify-center">
                <div className="relative">
                  <img src={referencePreview} alt="" className="w-24 h-24 object-cover rounded-xl border border-gold-400/20" />
                  <button onClick={() => { if (referencePreview) URL.revokeObjectURL(referencePreview); setReferenceFile(null); setReferencePreview(null) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-studio-bg border border-gold-400/40 text-gold-400 text-[10px] flex items-center justify-center hover:bg-gold-400 hover:text-studio-bg transition">✕</button>
                </div>
              </div>
            )}
            <button onClick={() => referenceFile && setStep(STEPS.TARGET)} disabled={!referenceFile} className={`w-full mt-8 py-4 rounded-xl text-sm font-semibold tracking-wide transition-all ${referenceFile ? 'bg-gold-400 text-studio-bg hover:bg-gold-300 cursor-pointer' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}>Próximo →</button>
          </div>
        )}

        {step === STEPS.TARGET && (
          <div>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-normal mb-2">Foto <span className="text-gold-400 italic">Modelo</span></h2>
              <p className="text-sm text-white/35 leading-relaxed">Envie a foto com a pose e cenário desejados.<br />O rosto será substituído pelo da referência.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-gold-400/[0.04] border border-gold-400/10 rounded-xl mb-6">
              {referencePreview && <img src={referencePreview} alt="" className="w-9 h-9 rounded-lg object-cover border border-gold-400/20" />}
              <span className="text-xs text-white/40">1 foto de referência</span>
              <button onClick={() => setStep(STEPS.REFERENCE)} className="ml-auto text-xs text-gold-400 hover:text-gold-300 transition">Editar</button>
            </div>
            {!targetPreview ? (
              <div onClick={() => targetInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleTarget(e.dataTransfer.files) }} className="border-2 border-dashed border-gold-400/30 hover:border-gold-400/60 rounded-2xl py-12 px-8 text-center cursor-pointer transition-all hover:bg-gold-400/[0.02]">
                <div className="text-5xl mb-4 opacity-70">📸</div>
                <p className="font-display text-lg text-gold-400 font-semibold mb-1">Arraste a foto modelo aqui</p>
                <p className="text-xs text-white/40">A foto com a pose, roupa e cenário desejados</p>
                <input ref={targetInputRef} type="file" accept="image/*" onChange={e => e.target.files && handleTarget(e.target.files)} className="hidden" />
              </div>
            ) : (
              <div className="text-center">
                <div className="relative inline-block">
                  <img src={targetPreview} alt="" className="max-w-full max-h-[360px] rounded-2xl border border-gold-400/15" />
                  <button onClick={() => { if (targetPreview) URL.revokeObjectURL(targetPreview); setTargetFile(null); setTargetPreview(null) }} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/70 border border-gold-400/30 text-gold-400 text-sm flex items-center justify-center hover:bg-gold-400 hover:text-studio-bg transition">✕</button>
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep(STEPS.REFERENCE)} className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition">← Voltar</button>
              <button onClick={processSwap} disabled={!targetFile} className={`flex-1 py-4 rounded-xl text-sm font-semibold tracking-wide transition-all ${targetFile ? 'bg-gradient-to-br from-gold-400 to-gold-500 text-studio-bg hover:from-gold-300 hover:to-gold-400 cursor-pointer' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}>✦ Gerar Ensaio</button>
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <div className="text-center pt-10">
            <div className="w-20 h-20 mx-auto mb-8 rounded-full border-2 border-gold-400/15 border-t-gold-400 animate-spin-slow" />
            <h2 className="font-display text-2xl font-normal mb-3">Criando seu <span className="text-gold-400 italic">ensaio</span>...</h2>
            <p className="text-sm text-white/35 mb-8">A IA está analisando as características faciais e gerando a imagem</p>
            <div className="max-w-xs mx-auto">
              <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-gold-400 to-gold-200 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              <p className="text-xs text-white/25 mt-2">{progress}%</p>
            </div>
            <div className="flex justify-center gap-4 mt-10 opacity-40">
              {referencePreview && <img src={referencePreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-gold-400/20" />}
              <div className="flex items-center text-xl text-gold-400">→</div>
              {targetPreview && <img src={targetPreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-gold-400/20" />}
            </div>
          </div>
        )}

        {step === STEPS.RESULT && result && (
          <div className="text-center">
            <h2 className="font-display text-3xl font-normal mb-2">Seu <span className="text-gold-400 italic">ensaio</span> está pronto</h2>
            <p className="text-sm text-white/35 mb-8">Imagem gerada com sucesso via Replicate AI</p>
            <div className="rounded-2xl overflow-hidden border border-gold-400/15 mb-8 relative">
              <img src={result} alt="Resultado" className="w-full block" />
              <div className="absolute bottom-4 left-4 flex gap-2 bg-black/70 backdrop-blur-sm px-3 py-2 rounded-xl">
                {referencePreview && <div className="text-center"><img src={referencePreview} alt="" className="w-10 h-10 rounded-lg object-cover" /><p className="text-[9px] text-white/50 mt-1">Ref</p></div>}
                {targetPreview && <div className="text-center"><img src={targetPreview} alt="" className="w-10 h-10 rounded-lg object-cover" /><p className="text-[9px] text-white/50 mt-1">Modelo</p></div>}
              </div>
            </div>
            <div className="flex gap-3">
              <a href={result} download="ensaio-studio.png" target="_blank" rel="noopener noreferrer" className="flex-1 py-4 bg-gradient-to-br from-gold-400 to-gold-500 text-studio-bg rounded-xl text-sm font-semibold text-center hover:from-gold-300 hover:to-gold-400 transition">↓ Baixar Imagem</a>
              <button onClick={reset} className="py-4 px-6 text-white/50 border border-white/10 rounded-xl text-sm hover:border-white/20 transition">Novo Ensaio</button>
            </div>
          </div>
        )}

        <div className="mt-16 text-center text-[11px] text-white/15 leading-relaxed">
          <p>Powered by Replicate AI • Face Swap Model</p>
          <p>As imagens são processadas via API e não ficam armazenadas</p>
        </div>
      </main>
    </div>
  )
}
