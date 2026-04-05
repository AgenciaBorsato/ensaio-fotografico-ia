import { defineConfig } from '@trigger.dev/sdk/v3'
import { prismaExtension } from '@trigger.dev/build/extensions/prisma'

export default defineConfig({
  project: 'proj_npohrrmkivfsvfywwxjb',
  maxDuration: 3600,
  dirs: ['./src/trigger/jobs'],
  build: {
    extensions: [
      prismaExtension({
        schema: 'prisma/schema.prisma',
      }),
    ],
  },
})
