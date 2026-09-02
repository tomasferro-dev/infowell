import { existsSync } from 'node:fs'
import path from 'node:path'

import { config } from 'dotenv'

/**
 * De qué base habla cada herramienta.
 *
 * `.env` es PRODUCCIÓN y no se toca nunca: es el que usa `npm run dev` y el
 * que refleja lo que hay en Vercel. `.env.test` encima de él pisa solo las
 * cuatro variables de la base, y es el que usan los tests y los comandos de
 * base contra desarrollo.
 *
 * Antes esto se resolvía cambiando el `.env` de ida y vuelta a mano. Eso
 * funciona hasta el día que uno se olvida de volver atrás y corre 300 tests
 * —que crean y borran— contra los datos del cliente.
 */

export const ARCHIVO_DEV = '.env.test'

/**
 * La raíz del proyecto.
 *
 * `process.cwd()` y no `import.meta.dirname`: Playwright compila su config a
 * CommonJS, donde `import.meta` no existe. Todo lo que carga esto —los tests y
 * los scripts de npm— corre desde la raíz.
 */
const raiz = process.cwd()

/** Carga `.env` y, encima, `.env.test` si existe. */
export function cargarEntorno(): { hayDev: boolean } {
  config({ path: path.join(raiz, '.env'), quiet: true })

  const dev = path.join(raiz, ARCHIVO_DEV)
  if (!existsSync(dev)) return { hayDev: false }

  // override: estas SÍ pisan lo que vino de .env, que es todo el punto.
  config({ path: dev, override: true, quiet: true })
  return { hayDev: true }
}

/**
 * La referencia del proyecto de Supabase que hay en una URL de conexión.
 *
 * El usuario del pooler tiene la forma `postgres.<referencia>`, y esa
 * referencia es lo único que distingue una base de otra a simple vista.
 */
export function proyectoDe(url: string | undefined): string | null {
  if (!url) return null

  try {
    const { username } = new URL(url)
    return username.includes('.') ? (username.split('.')[1] ?? null) : null
  } catch {
    return null
  }
}

/** Lee el proyecto declarado en un archivo de entorno, sin cargarlo. */
export function proyectoDelArchivo(archivo: string): string | null {
  const ruta = path.join(raiz, archivo)
  if (!existsSync(ruta)) return null

  const { parsed } = config({ path: ruta, processEnv: {}, quiet: true })
  return proyectoDe(parsed?.DATABASE_URL)
}

/**
 * Corta si los tests fueran a correr contra la base del cliente.
 *
 * Es una traba, no un aviso: los tests crean y borran fincas, pozos y
 * usuarios. Documentarlo no alcanza — un descuido de un minuto se lleva datos
 * que no se pueden recuperar.
 */
export function exigirBaseDeDesarrollo(): void {
  // Contra una URL externa los tests no tocan la base local: no aplica.
  if (process.env.E2E_BASE_URL) return

  verificarSeparacion(proyectoDelArchivo('.env'), proyectoDelArchivo(ARCHIVO_DEV))
}

/**
 * La decisión, separada de los archivos para poder probarla.
 *
 * Tirar una excepción y no devolver un booleano es a propósito: quien la
 * llama no tiene que acordarse de chequear nada.
 */
export function verificarSeparacion(produccion: string | null, desarrollo: string | null): void {
  if (!desarrollo) {
    throw new Error(
      `\n\n  Falta ${ARCHIVO_DEV}.\n\n` +
        '  Los tests crean y borran datos, así que no pueden correr contra la\n' +
        '  base de producción. Creá ese archivo con las cuatro variables del\n' +
        '  proyecto de desarrollo (ver DEPLOY.md):\n\n' +
        '    DATABASE_URL, DIRECT_URL,\n' +
        '    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n\n' +
        '  El .env no se toca: ese es producción.\n',
    )
  }

  if (produccion && desarrollo === produccion) {
    throw new Error(
      `\n\n  ${ARCHIVO_DEV} apunta al MISMO proyecto que .env (${desarrollo}).\n\n` +
        '  Sería correr los tests contra la base del cliente: crean y borran\n' +
        '  fincas, pozos y usuarios. Revisá las credenciales.\n',
    )
  }
}
