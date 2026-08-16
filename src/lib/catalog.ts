import { toSlug } from '@/lib/slug'

/**
 * Búsqueda y deduplicación de los catálogos extensibles (servicios y
 * electrobombas).
 *
 * Se usa tanto en el cliente (filtrar mientras se escribe) como en el servidor
 * (validar antes de crear). Por eso no importa nada de Prisma ni de Next.
 */

/** Minúsculas y sin acentos, conservando los espacios para buscar por substring. */
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * ¿El texto contiene la búsqueda, ignorando acentos y mayúsculas?
 *
 * Sin esto, "perforacion" no encuentra "Perforación de pozo" y el operario
 * termina creando un duplicado del servicio que ya existía.
 */
export function coincide(texto: string, busqueda: string): boolean {
  const q = normalizar(busqueda)
  if (q === '') return true
  return normalizar(texto).includes(q)
}

export function filtrarCatalogo<T>(
  items: T[],
  busqueda: string,
  obtenerTexto: (item: T) => string,
): T[] {
  return items.filter((item) => coincide(obtenerTexto(item), busqueda))
}

/**
 * Busca un elemento ya existente equivalente al nombre tipeado.
 *
 * Compara por slug, la misma normalización que usa el índice único de la base:
 * así lo que acá se considera duplicado es exactamente lo que la base
 * rechazaría, sin sorpresas.
 */
export function encontrarDuplicado<T>(
  items: T[],
  nombre: string,
  obtenerSlug: (item: T) => string,
): T | undefined {
  const slug = toSlug(nombre)
  if (slug === '') return undefined
  return items.find((item) => obtenerSlug(item) === slug)
}
