-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('PUNTO', 'LINEA', 'POLIGONO');

-- CreateTable
CREATE TABLE "MapAnnotation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT 'rojo',
    "filled" BOOLEAN NOT NULL DEFAULT false,
    "geometry" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MapAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapAnnotation_farmId_deletedAt_idx" ON "MapAnnotation"("farmId", "deletedAt");

-- AddForeignKey
ALTER TABLE "MapAnnotation" ADD CONSTRAINT "MapAnnotation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapAnnotation" ADD CONSTRAINT "MapAnnotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
