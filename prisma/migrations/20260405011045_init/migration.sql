-- CreateEnum
CREATE TYPE "EnsaioStatus" AS ENUM ('draft', 'training', 'trained', 'generating', 'completed');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('generating', 'upscaling', 'restoring', 'scoring', 'pending_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Ensaio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EnsaioStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inspirationPhotoUrl" TEXT,

    CONSTRAINT "Ensaio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePhoto" (
    "id" TEXT NOT NULL,
    "ensaioId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplatePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferencePhoto" (
    "id" TEXT NOT NULL,
    "ensaioId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferencePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoraModel" (
    "id" TEXT NOT NULL,
    "ensaioId" TEXT NOT NULL,
    "replicateTrainingId" TEXT,
    "status" "TrainingStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "loraUrl" TEXT,
    "triggerWord" TEXT NOT NULL,
    "replicateModelUrl" TEXT,
    "trainingCostUsd" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LoraModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedPhoto" (
    "id" TEXT NOT NULL,
    "ensaioId" TEXT NOT NULL,
    "templatePhotoId" TEXT NOT NULL,
    "rawUrl" TEXT,
    "upscaledUrl" TEXT,
    "restoredUrl" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" "PhotoStatus" NOT NULL DEFAULT 'generating',
    "seed" INTEGER,
    "notes" TEXT,
    "replicatePredictionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplatePhoto_ensaioId_idx" ON "TemplatePhoto"("ensaioId");

-- CreateIndex
CREATE INDEX "ReferencePhoto_ensaioId_idx" ON "ReferencePhoto"("ensaioId");

-- CreateIndex
CREATE UNIQUE INDEX "LoraModel_ensaioId_key" ON "LoraModel"("ensaioId");

-- CreateIndex
CREATE INDEX "GeneratedPhoto_ensaioId_idx" ON "GeneratedPhoto"("ensaioId");

-- CreateIndex
CREATE INDEX "GeneratedPhoto_templatePhotoId_idx" ON "GeneratedPhoto"("templatePhotoId");

-- CreateIndex
CREATE INDEX "GeneratedPhoto_status_idx" ON "GeneratedPhoto"("status");

-- AddForeignKey
ALTER TABLE "TemplatePhoto" ADD CONSTRAINT "TemplatePhoto_ensaioId_fkey" FOREIGN KEY ("ensaioId") REFERENCES "Ensaio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePhoto" ADD CONSTRAINT "ReferencePhoto_ensaioId_fkey" FOREIGN KEY ("ensaioId") REFERENCES "Ensaio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraModel" ADD CONSTRAINT "LoraModel_ensaioId_fkey" FOREIGN KEY ("ensaioId") REFERENCES "Ensaio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedPhoto" ADD CONSTRAINT "GeneratedPhoto_ensaioId_fkey" FOREIGN KEY ("ensaioId") REFERENCES "Ensaio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedPhoto" ADD CONSTRAINT "GeneratedPhoto_templatePhotoId_fkey" FOREIGN KEY ("templatePhotoId") REFERENCES "TemplatePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
