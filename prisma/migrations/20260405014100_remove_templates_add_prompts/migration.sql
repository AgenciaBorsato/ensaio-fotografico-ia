/*
  Warnings:

  - You are about to drop the column `templatePhotoId` on the `GeneratedPhoto` table. All the data in the column will be lost.
  - You are about to drop the `TemplatePhoto` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `prompt` to the `GeneratedPhoto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GeneratedPhoto" DROP CONSTRAINT "GeneratedPhoto_templatePhotoId_fkey";

-- DropForeignKey
ALTER TABLE "TemplatePhoto" DROP CONSTRAINT "TemplatePhoto_ensaioId_fkey";

-- DropIndex
DROP INDEX "GeneratedPhoto_templatePhotoId_idx";

-- AlterTable
ALTER TABLE "Ensaio" ADD COLUMN     "photosPerPrompt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "prompts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "GeneratedPhoto" DROP COLUMN "templatePhotoId",
ADD COLUMN     "prompt" TEXT NOT NULL;

-- DropTable
DROP TABLE "TemplatePhoto";
