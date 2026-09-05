-- CreateTable
CREATE TABLE "MapOverlay" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "etiqueta" TEXT,
    "rutaArchivo" TEXT NOT NULL,
    "esquinas" JSONB NOT NULL,
    "opacidad" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MapOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapOverlay_farmId_deletedAt_idx" ON "MapOverlay"("farmId", "deletedAt");

-- AddForeignKey
ALTER TABLE "MapOverlay" ADD CONSTRAINT "MapOverlay_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapOverlay" ADD CONSTRAINT "MapOverlay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
