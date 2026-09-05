import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'

import { PrismaClient } from '../src/generated/prisma/client'
import { BUCKET_MAPA, BUCKET_NOTAS_VOZ, BUCKET_REMITOS } from '../src/lib/storage-paths'

/**
 * Encuentra archivos en Storage que ninguna fila usa.
 *
 * Cómo aparecen: alguien graba un audio o elige una foto —el archivo se sube
 * enseguida, antes de guardar el formulario— y después abandona la pantalla.
 * El archivo queda en el bucket sin nada que lo mencione, ocupando cuota para
 * siempre. Nadie lo ve, y por eso nadie lo reporta.
 *
 * Corre EN SECO por defecto:
 *
 *   npx tsx scripts/limpiar-huerfanos.ts                    ← muestra, no toca
 *   npx tsx scripts/limpiar-huerfanos.ts --aplicar          ← borra los sin fila
 *   npx tsx scripts/limpiar-huerfanos.ts --aplicar --incluir-borrados
 *
 * Dos categorías, y la diferencia importa:
 *
 *   SIN FILA      Ninguna fila lo menciona, ni siquiera una borrada. Es basura
 *                 pura y se puede borrar.
 *   FILA BORRADA  Lo menciona una fila con borrado suave. Borrar el archivo
 *                 vuelve ese borrado IRREVERSIBLE, así que va aparte y hace
 *                 falta pedirlo con `--incluir-borrados`.
 *
 * Y una guarda de tiempo: los archivos de las últimas 24 horas se saltean
 * SIEMPRE. Un archivo recién subido puede ser de un formulario que todavía
 * está abierto en el celular de alguien; borrarlo le rompería la carga en la
 * cara sin que se entienda por qué.
 */

const APLICAR = process.argv.includes('--aplicar')
const INCLUIR_BORRADOS = process.argv.includes('--incluir-borrados')

/** Un archivo más nuevo que esto no se toca: puede ser de una carga en curso. */
const HORAS_DE_GRACIA = 24

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
})

function storage() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, clave, { auth: { persistSession: false } })
}

type Archivo = { ruta: string; creado: Date }

/**
 * Lista un bucket entero.
 *
 * Recursivo porque `list` de Supabase devuelve UN nivel: las rutas son
 * `farmId/recursoId/archivo`, así que sin bajar tres niveles no se ve nada.
 * Un directorio se reconoce porque no trae metadatos.
 */
async function listarBucket(bucket: string, prefijo = ''): Promise<Archivo[]> {
  const supabase = storage()
  const encontrados: Archivo[] = []
  let desde = 0

  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefijo, { limit: 100, offset: desde })

    if (error) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${error.message}`)
    if (!data || data.length === 0) break

    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name

      if (entrada.id === null) {
        // Es carpeta: no tiene id ni metadatos propios.
        encontrados.push(...(await listarBucket(bucket, ruta)))
      } else {
        encontrados.push({ ruta, creado: new Date(entrada.created_at ?? 0) })
      }
    }

    if (data.length < 100) break
    desde += data.length
  }

  return encontrados
}

/** Las rutas que la base menciona, separadas por si su fila está viva. */
async function rutasEnLaBase() {
  const [fotos, audios, imagenes] = await Promise.all([
    prisma.receiptPhoto.findMany({ select: { storagePath: true } }),
    prisma.voiceNote.findMany({ select: { storagePath: true } }),
    prisma.mapOverlay.findMany({ select: { rutaArchivo: true, deletedAt: true } }),
  ])

  const vivas = new Set<string>()
  const borradas = new Set<string>()

  for (const f of fotos) vivas.add(f.storagePath)
  for (const a of audios) vivas.add(a.storagePath)
  for (const i of imagenes) (i.deletedAt ? borradas : vivas).add(i.rutaArchivo)

  return { vivas, borradas }
}

async function main() {
  console.log(APLICAR ? '\n=== APLICANDO ===\n' : '\n=== EN SECO (nada se toca) ===\n')

  const { vivas, borradas } = await rutasEnLaBase()
  const corte = new Date(Date.now() - HORAS_DE_GRACIA * 60 * 60 * 1000)

  let totalSinFila = 0
  let totalDeBorradas = 0

  for (const bucket of [BUCKET_REMITOS, BUCKET_NOTAS_VOZ, BUCKET_MAPA]) {
    const archivos = await listarBucket(bucket)

    const recientes = archivos.filter((a) => a.creado > corte)
    const viejos = archivos.filter((a) => a.creado <= corte)

    const sinFila = viejos.filter((a) => !vivas.has(a.ruta) && !borradas.has(a.ruta))
    const deBorradas = viejos.filter((a) => borradas.has(a.ruta))

    console.log(`${bucket}: ${archivos.length} archivos`)
    console.log(`  en uso            ${viejos.length - sinFila.length - deBorradas.length}`)
    console.log(`  recientes (24 h)  ${recientes.length}  ← no se tocan nunca`)
    console.log(`  SIN FILA          ${sinFila.length}`)
    console.log(`  de fila borrada   ${deBorradas.length}`)

    for (const a of sinFila) console.log(`    · ${a.ruta}`)
    for (const a of deBorradas) console.log(`    (borrada) ${a.ruta}`)

    totalSinFila += sinFila.length
    totalDeBorradas += deBorradas.length

    if (APLICAR) {
      const aBorrar = [
        ...sinFila.map((a) => a.ruta),
        ...(INCLUIR_BORRADOS ? deBorradas.map((a) => a.ruta) : []),
      ]

      if (aBorrar.length > 0) {
        const { error } = await storage().storage.from(bucket).remove(aBorrar)
        if (error) throw new Error(`No se pudo borrar en ${bucket}: ${error.message}`)
        console.log(`  ✓ ${aBorrar.length} borrados`)
      }
    }

    console.log()
  }

  if (!APLICAR) {
    console.log(`Total: ${totalSinFila} sin fila, ${totalDeBorradas} de filas borradas.`)
    console.log('Para borrar los sin fila:  --aplicar')
    if (totalDeBorradas > 0) {
      console.log('Para borrar también los de filas borradas: --aplicar --incluir-borrados')
      console.log('⚠️  Eso vuelve IRREVERSIBLE el borrado de esas imágenes.')
    }
  }
}

main()
  .catch((e: Error) => {
    console.error(e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
