import Replicate from 'replicate'

const globalForReplicate = globalThis as unknown as { replicate: Replicate }

export const replicate = globalForReplicate.replicate || new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

if (process.env.NODE_ENV !== 'production') globalForReplicate.replicate = replicate

export const REPLICATE_VERSIONS = {
  REAL_ESRGAN: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
  CODEFORMER: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
} as const
