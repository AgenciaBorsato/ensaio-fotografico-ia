import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'ensaio-studio'

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  const url = await getSignedUrl(r2Client, command, { expiresIn })
  return { url, key }
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(r2Client, command, { expiresIn })
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })
  return r2Client.send(command)
}

export function buildR2Key(parts: { ensaioId: string; type: 'templates' | 'references' | 'inspiration' | 'lora' | 'generated' | 'upscaled' | 'restored'; filename: string }) {
  return `ensaios/${parts.ensaioId}/${parts.type}/${parts.filename}`
}

// Gera URL publica via proxy do servidor (para Replicate acessar imagens do R2)
export function getPublicProxyUrl(key: string) {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${baseUrl}/api/r2-proxy?key=${encodeURIComponent(key)}`
}

// Baixa arquivo do R2 como Buffer
export async function downloadFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })
  const response = await r2Client.send(command)
  if (!response.Body) throw new Error(`Arquivo nao encontrado: ${key}`)
  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}
