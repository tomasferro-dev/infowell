// Prisma 7 ya no carga los .env por su cuenta: la CLI corre fuera de Next.js,
// así que el archivo se carga explícitamente acá.
import 'dotenv/config'

import { defineConfig } from 'prisma/config'

/**
 * La CLI de Prisma (migrate, db push, studio) usa SIEMPRE la conexión directa:
 * el pooler en modo transaction no soporta las sentencias DDL de una migración.
 * El runtime, en cambio, usa DATABASE_URL (pooled) vía el driver adapter en
 * src/server/db.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Sin env(): `prisma generate` no necesita la DB, y env() aborta si falta
    // la variable — eso rompería `npm install` (postinstall) en un clon nuevo.
    // Los comandos que sí tocan la DB fallan igual, con un error propio.
    url: process.env.DIRECT_URL ?? '',
  },
})
