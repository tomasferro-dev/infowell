import { randomUUID } from 'node:crypto'

/**
 * Rutas de los archivos en Storage.
 *
 * El primer segmento SIEMPRE es el farmId. No es una convención de orden: es de
 * donde sale el permiso para firmar la URL. Si un id pudiera contener barras,
 * se podría escribir en la carpeta de otra finca — de ahí las validaciones.
 */

export const BUCKET_REMITOS = 'remitos'
export const BUCKET_NOTAS_VOZ = 'notas-voz'
/** Imágenes que el usuario calza sobre el mapa (§11 de la bitácora). */
export const BUCKET_MAPA = 'mapa'

/** Solo caracteres seguros: sin barras, sin puntos, sin nada que escape. */
const SEGMENTO_VALIDO = /^[A-Za-z0-9_-]+$/

export function construirRuta({
  farmId,
  recursoId,
  ext,
}: {
  farmId: string
  recursoId: string
  ext: string
}): string {
  if (!SEGMENTO_VALIDO.test(farmId)) throw new Error('farmId inválido para la ruta')
  if (!SEGMENTO_VALIDO.test(recursoId)) throw new Error('recursoId inválido para la ruta')
  if (!/^[a-z0-9]+$/.test(ext)) throw new Error('extensión inválida')

  return `${farmId}/${recursoId}/${randomUUID()}.${ext}`
}

/**
 * Valida una ruta que llega desde afuera y devuelve la finca dueña.
 * `null` si es sospechosa: quien la pidió no debe recibir ningún archivo.
 */
export function interpretarRuta(ruta: string): { farmId: string; recursoId: string } | null {
  if (!ruta || ruta.startsWith('/')) return null
  // Se rechaza el salto de directorio de forma explícita, además del regex.
  if (ruta.includes('..') || ruta.includes('\\')) return null

  const segmentos = ruta.split('/')
  if (segmentos.length < 3) return null

  const [farmId, recursoId] = segmentos
  if (!farmId || !recursoId) return null
  if (!SEGMENTO_VALIDO.test(farmId) || !SEGMENTO_VALIDO.test(recursoId)) return null

  return { farmId, recursoId }
}

/**
 * Formatos que produce MediaRecorder en los navegadores reales:
 * Chrome/Android graba webm-opus, iOS Safari graba mp4.
 */
const MIMES_AUDIO: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
}

/** Descarta los parámetros del mime: "audio/webm;codecs=opus" → "audio/webm". */
function tipoBase(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase()
}

export function mimeAudioPermitido(mime: string): boolean {
  return tipoBase(mime) in MIMES_AUDIO
}

export function extensionDeMime(mime: string): string {
  return MIMES_AUDIO[tipoBase(mime)] ?? 'bin'
}

/** Imágenes aceptadas para los remitos (se usa en la Fase 6). */
const MIMES_IMAGEN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

export function mimeImagenPermitido(mime: string): boolean {
  return tipoBase(mime) in MIMES_IMAGEN
}

export function extensionDeImagen(mime: string): string {
  return MIMES_IMAGEN[tipoBase(mime)] ?? 'bin'
}
