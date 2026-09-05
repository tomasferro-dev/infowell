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

/**
 * Qué se puede subir, de qué tipo, y con qué permiso.
 *
 * Es una tabla y no una cadena de ternarios a propósito: con dos tipos un
 * `esAudio ? a : b` alcanzaba, con tres deja de leerse y se vuelve el lugar
 * ideal para un error silencioso. Y lo que se decide acá es permiso: si una
 * imagen del mapa pidiera el recurso `receipt`, la podría subir el cargador,
 * que no debe tocarla.
 *
 * Separada de la ruta HTTP para poder probarla sin levantar un servidor.
 */

export const TIPOS_DE_SUBIDA = ['nota-voz', 'remito', 'imagen-mapa'] as const

export type TipoDeSubida = (typeof TIPOS_DE_SUBIDA)[number]

type ConfiguracionDeSubida = {
  /** El recurso contra el que se pide permiso de escritura (ver authz.ts). */
  recurso: 'observation' | 'receipt' | 'overlay'
  bucket: string
  permite: (mime: string) => boolean
  extension: (mime: string) => string
}

export const SUBIDAS: Record<TipoDeSubida, ConfiguracionDeSubida> = {
  'nota-voz': {
    recurso: 'observation',
    bucket: BUCKET_NOTAS_VOZ,
    permite: mimeAudioPermitido,
    extension: extensionDeMime,
  },
  remito: {
    recurso: 'receipt',
    bucket: BUCKET_REMITOS,
    permite: mimeImagenPermitido,
    extension: extensionDeImagen,
  },
  'imagen-mapa': {
    recurso: 'overlay',
    bucket: BUCKET_MAPA,
    permite: mimeImagenPermitido,
    extension: extensionDeImagen,
  },
}

/**
 * De qué recurso es un bucket, para la ruta que SIRVE los archivos.
 *
 * Se deriva de SUBIDAS y no es una segunda tabla: dos tablas paralelas se
 * desincronizan, y acá desincronizarse significa servirle a alguien un archivo
 * que no le corresponde.
 *
 * Devuelve `null` ante un bucket desconocido en vez de un recurso por defecto:
 * quien llama tiene que decidir, y lo único correcto es no servir nada.
 */
export function recursoDeBucket(bucket: string): ConfiguracionDeSubida['recurso'] | null {
  for (const tipo of TIPOS_DE_SUBIDA) {
    if (SUBIDAS[tipo].bucket === bucket) return SUBIDAS[tipo].recurso
  }
  return null
}
