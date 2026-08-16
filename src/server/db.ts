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
 * Tiempo máximo para conseguir una conexión.
 *
 * Sin esto, una base que no responde —Supabase pausa los proyectos gratuitos
 * tras una semana sin uso, y el primer pedido después tarda en despertarla—
 * deja el request esperando indefinidamente: el usuario ve la pantalla trabada
 * sin ningún error, que es lo peor de los dos mundos. Con el límite, falla en
 * 20 segundos y la pantalla de error ofrece reintentar.
 *
 * Es lo ÚNICO que se toca del pool. Se probó también fijar `max`,
 * `idleTimeoutMillis` y `statement_timeout`, y esa combinación producía
 * `DriverAdapterError: ConnectionClosed` en medio de las transacciones: el
 * pool cerraba conexiones que el cliente todavía tenía en uso. Los valores por
 * defecto de pg funcionan bien con el pooler de Supabase; no conviene
 * cambiarlos sin una razón medida.
 */
const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 20_000 })

/**
 * Singleton: en dev, el hot reload de Next re-ejecuta este módulo en cada
 * cambio y sin el cache global se acumularían clientes (y conexiones).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
