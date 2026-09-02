import { spawnSync } from 'node:child_process'

import { cargarEntorno, exigirBaseDeDesarrollo, proyectoDe } from './entorno'

/**
 * Corre un comando contra la base de DESARROLLO.
 *
 * Uso: tsx scripts/con-dev.ts prisma migrate deploy
 *
 * Existe para no tener que cambiar el `.env` de ida y vuelta. El `.env` queda
 * siempre en producción; esto pone `.env.test` encima solo para el comando que
 * se le pase.
 */

const [comando, ...args] = process.argv.slice(2)

if (!comando) {
  console.error('Falta el comando. Ejemplo: tsx scripts/con-dev.ts prisma migrate deploy')
  process.exit(1)
}

cargarEntorno()

try {
  exigirBaseDeDesarrollo()
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}

console.log(`→ ${comando} ${args.join(' ')}  (proyecto ${proyectoDe(process.env.DATABASE_URL)})\n`)

const r = spawnSync(comando, args, { stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
