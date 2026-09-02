import { createClient } from '@supabase/supabase-js'

import { BUCKET_NOTAS_VOZ, BUCKET_REMITOS } from '../src/lib/storage-paths'

/**
 * Crea los buckets que la app necesita, en el proyecto al que apunte el
 * entorno cargado.
 *
 *   npm run db:buckets:dev
 *
 * Existe porque una base recién migrada tiene las tablas pero no los buckets,
 * y los datos de demostración cortan al subir la primera foto con un
 * «Invalid path specified in request URL» que no dice que falta el bucket.
 *
 * Los dos son PRIVADOS y no se negocia: un remito es de una finca, y el
 * acceso se da firmando URLs de a una. Un bucket público dejaría a cualquiera
 * con el link ver el legajo de un cliente que no es suyo.
 *
 * Es idempotente: si ya existen, no toca nada. Tampoco los pasa a privados si
 * alguien los creó públicos a mano — lo avisa, porque cambiarlo por debajo de
 * quien lo hizo a propósito sería peor que decirlo.
 */

const BUCKETS = [BUCKET_REMITOS, BUCKET_NOTAS_VOZ]

async function main() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, clave, { auth: { persistSession: false } })

  const { data: existentes, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`No se pudieron listar los buckets: ${error.message}`)

  for (const nombre of BUCKETS) {
    const ya = existentes.find((b) => b.name === nombre)

    if (ya) {
      if (ya.public) console.log(`  ⚠ ${nombre} ya existe pero es PÚBLICO — tiene que ser privado`)
      else console.log(`  · ${nombre} ya existe`)
      continue
    }

    const { error: fallo } = await supabase.storage.createBucket(nombre, { public: false })
    if (fallo) throw new Error(`No se pudo crear ${nombre}: ${fallo.message}`)
    console.log(`  ✓ ${nombre} creado (privado)`)
  }
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
