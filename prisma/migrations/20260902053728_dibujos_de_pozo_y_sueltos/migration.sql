-- AlterTable
ALTER TABLE "MapAnnotation" ADD COLUMN     "wellId" TEXT,
ALTER COLUMN "farmId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MapAnnotation_wellId_deletedAt_idx" ON "MapAnnotation"("wellId", "deletedAt");

-- AddForeignKey
ALTER TABLE "MapAnnotation" ADD CONSTRAINT "MapAnnotation_wellId_fkey" FOREIGN KEY ("wellId") REFERENCES "Well"("id") ON DELETE CASCADE ON UPDATE CASCADE;
