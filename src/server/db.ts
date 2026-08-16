import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/**
 * Runtime: conexión POOLED (pgBouncer de Supabase, puerto 6543).
 * En serverless cada invocación puede abrir su propia conexión; sin pooler se
 * agota el límite de Postgres. Las migraciones usan DIRECT_URL — ver
 * prisma.config.ts.
 */
/**
 * Sin `throw` en el cuerpo del módulo, a propósito.
 *
 * `next build` importa cada ruta para recolectar sus datos; si este archivo
 * lanzara al importarse, la falta de una variable de ejecución rompería el
 * build. Con la cadena vacía, el error aparece en la primera consulta —donde
 * corresponde— y el deploy no se cae por algo que no es de compilación.
 */
const connectionString = process.env.DATABASE_URL ?? ''

if (!connectionString) {
  // Avisa, pero no corta: el mensaje queda en los logs del servidor y el
  // error real lo da la primera consulta. Sin esto, faltar la variable se
  // manifestaría como un error críptico del driver de Postgres.
  console.error('Falta DATABASE_URL: la app no va a poder consultar la base.')
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
