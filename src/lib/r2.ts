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

export function buildR2Key(parts: { ensaioId: string; clientId?: string; type: 'templates' | 'references' | 'inspiration' | 'lora' | 'generated' | 'upscaled' | 'restored'; filename: string }) {
  const { ensaioId, clientId, type, filename } = parts
  if (clientId) {
    return `ensaios/${ensaioId}/clients/${clientId}/${type}/${filename}`
  }
  return `ensaios/${ensaioId}/${type}/${filename}`
}
