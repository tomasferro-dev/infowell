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
 * Límites de tiempo, para que nada se quede colgado.
 *
 * Sin estos valores, una base que no responde —Supabase pausa los proyectos
 * gratuitos tras una semana sin uso, y el primer pedido después tarda en
 * despertarla— deja el request esperando indefinidamente: el usuario ve la
 * pantalla trabada sin ningún error, que es lo peor de los dos mundos.
 *
 * Fallar en 15 segundos permite mostrar un mensaje y ofrecer reintentar.
 */
const adapter = new PrismaPg({
  connectionString,
  // Tiempo para conseguir una conexión del pool.
  connectionTimeoutMillis: 15_000,
  // Corta consultas desbocadas del lado del servidor de base.
  statement_timeout: 20_000,
  // Cierra las conexiones ociosas: en serverless cada instancia tiene su pool
  // y dejarlas abiertas consume el cupo del plan gratuito.
  idleTimeoutMillis: 10_000,
  // Pocas conexiones por instancia: la concurrencia la maneja el pooler.
  max: 5,
})

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
