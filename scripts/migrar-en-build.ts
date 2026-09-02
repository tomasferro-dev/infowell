import { spawnSync } from 'node:child_process'

/**
 * Aplica las migraciones durante el build, y SOLO en producción.
 *
 * Ahora que producción y desarrollo son dos proyectos de Supabase distintos,
 * el deploy de Production puede migrar su propia base y así el esquema nunca
 * queda atrás de la aplicación. Antes esto se hacía a mano desde la máquina de
 * uno, con el riesgo de olvidárselo.
 *
 * La guarda no es ceremonia. En el panel de Vercel las variables están
 * cargadas para Production Y Preview, así que **un preview apunta a la base
 * del cliente**: si el build migrara sin mirar el entorno, cualquier rama con
 * un `schema.prisma` a medio hacer le cambiaría el esquema a los datos reales.
 * Separar las bases locales no arregló eso; esta guarda sí.
 *
 * Se corre desde el `build` de package.json.
 */

/**
 * La decisión, separada del efecto para poder probarla.
 *
 * El parámetro es un registro y no `{ VERCEL_ENV?: string }` para que
 * `process.env` —que es un índice— entre sin castear.
 */
export function debeMigrar(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV === 'production'
}

/** El efecto. Solo corre cuando este archivo es el punto de entrada. */
function main() {
  if (!debeMigrar(process.env)) {
    console.log(`[migraciones] se saltean (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'sin definir'})`)
    return
  }

  console.log('[migraciones] deploy de producción: aplicando prisma migrate deploy')
  const r = spawnSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit', shell: true })

  // Cortar el build si la migración falla: publicar la app con la base atrás
  // es peor que no publicarla.
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (process.argv[1]?.includes('migrar-en-build')) main()
