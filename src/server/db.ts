import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/**
 * Runtime: conexión POOLED (pgBouncer de Supabase, puerto 6543).
 * En serverless cada invocación puede abrir su propia conexión; sin pooler se
 * agota el límite de Postgres. Las migraciones usan DIRECT_URL — ver
 * prisma.config.ts.
 */
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Falta DATABASE_URL. Copiá .env.example a .env y completalo.')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Singleton: en dev, el hot reload de Next re-ejecuta este módulo en cada
 * cambio y sin el cache global se acumularían clientes (y conexiones).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
