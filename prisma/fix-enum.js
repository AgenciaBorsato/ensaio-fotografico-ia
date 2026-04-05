// Script para adicionar valores faltantes no enum PhotoStatus do PostgreSQL
const { PrismaClient } = require('@prisma/client');

async function fixEnum() {
  const prisma = new PrismaClient();

  try {
    // Verificar valores atuais do enum
    const result = await prisma.$queryRaw`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PhotoStatus')
      ORDER BY enumsortorder
    `;

    const existingValues = result.map(r => r.enumlabel);
    console.log('Valores atuais do enum PhotoStatus:', existingValues);

    const requiredValues = ['generating', 'face_swapping', 'upscaling', 'restoring', 'scoring', 'pending_review', 'approved', 'rejected'];

    for (const val of requiredValues) {
      if (!existingValues.includes(val)) {
        console.log(`Adicionando valor '${val}' ao enum PhotoStatus...`);
        await prisma.$executeRawUnsafe(`ALTER TYPE "PhotoStatus" ADD VALUE IF NOT EXISTS '${val}'`);
        console.log(`  ✓ '${val}' adicionado`);
      }
    }

    console.log('Enum PhotoStatus corrigido!');
  } catch (error) {
    console.error('Erro ao corrigir enum:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
