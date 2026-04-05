'use client'

import { useState, useRef, useCallback } from 'react'

interface PhotoUploaderProps {
  ensaioId: string
  type: 'references' | 'inspiration'
  maxFiles: number
  onUploadComplete?: () => void
}

export default function PhotoUploader({ ensaioId, type, maxFiles, onUploadComplete }: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('ensaioId', ensaioId)
    formData.append('type', type)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Erro no upload')
    }
    return res.json()
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, maxFiles)
    if (imageFiles.length === 0) return

    setUploading(true)
    setError(null)
    setProgress(0)
    setUploadedCount(0)
    setTotalFiles(imageFiles.length)

    try {
      for (let i = 0; i < imageFiles.length; i++) {
        await uploadFile(imageFiles[i])
        setUploadedCount(i + 1)
        setProgress(Math.round(((i + 1) / imageFiles.length) * 100))
      }
      onUploadComplete?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [ensaioId, type, maxFiles, onUploadComplete])

  const labels = {
    references: { desc: 'Arraste 1-12 fotos do rosto do cliente', icon: '👤' },
    inspiration: { desc: 'Arraste a foto de inspiracao (estilo/mood)', icon: '✨' },
  }

  const label = labels[type]

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); !uploading && handleFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-2xl py-8 px-6 text-center transition-all ${
          uploading
            ? 'border-gold-400/20 bg-gold-400/[0.02] cursor-wait'
            : 'border-gold-400/30 hover:border-gold-400/60 cursor-pointer hover:bg-gold-400/[0.02]'
        }`}
      >
        {uploading ? (
          <div>
            <p className="text-sm text-gold-400 font-semibold mb-2">Enviando {uploadedCount}/{totalFiles}...</p>
            <div className="max-w-xs mx-auto">
              <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-gold-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-3xl mb-2 opacity-70">{label.icon}</div>
            <p className="font-display text-sm text-gold-400 font-semibold mb-1">{label.desc}</p>
            <p className="text-xs text-white/30">JPG, PNG ou WEBP - Maximo 50MB cada</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={type !== 'inspiration'}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}
