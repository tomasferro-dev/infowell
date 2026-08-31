import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Copia el worker de maplibre-gl a public/.
 *
 * maplibre-gl v6 crea su worker como módulo, con una URL relativa a su propio
 * archivo dentro de node_modules. Esa URL no sobrevive al empaquetado, y sin
 * worker el mapa se ve pero NADA vectorial anda: ni rellenos, ni líneas, ni
 * rótulos. El raster sigue funcionando —no pasa por el worker—, así que la
 * imagen satelital se dibuja igual y parece que está todo bien. No hay error.
 *
 * Se copia desde el paquete instalado y no a mano para que no quede pegado a
 * una versión vieja: al actualizar maplibre-gl, el worker se actualiza solo.
 * Corre en postinstall y antes del build.
 *
 * Van los DOS archivos y con sus nombres originales: el worker importa a su
 * hermano por ruta relativa, así que copiarlo solo o renombrarlo lo deja sin
 * poder cargarse — con el mismo silencio de siempre.
 */

const require = createRequire(import.meta.url)

const dist = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist')
const carpeta = path.join(process.cwd(), 'public', 'maplibre')

const ARCHIVOS = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

await mkdir(carpeta, { recursive: true })

for (const archivo of ARCHIVOS) {
  await copyFile(path.join(dist, archivo), path.join(carpeta, archivo))
}

console.log(`worker del mapa copiado a public/maplibre (${ARCHIVOS.length} archivos)`)
