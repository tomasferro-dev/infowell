/**
 * Ir al mapa a marcar un punto y volver al formulario con la coordenada.
 *
 * El contrato vive acá y no repartido entre la página y el mapa: son dos
 * lados de la misma conversación, y si cada uno arma los parámetros por su
 * cuenta, alcanza con renombrar uno para que el usuario pierda lo que había
 * escrito sin que nada falle a la vista.
 */

export type ModoColocacion = 'pozo' | 'finca'

/** Lo que se arrastra del formulario para no perderlo en el viaje. */
export const CAMPOS_ARRASTRADOS: Record<ModoColocacion, readonly string[]> = {
  pozo: ['name', 'code', 'drilledAt', 'notes'],
  finca: [
    'name',
    'taxId',
    'address',
    'city',
    'province',
    'contactName',
    'contactPhone',
    'contactEmail',
    'notes',
  ],
}

export function esModo(valor: unknown): valor is ModoColocacion {
  return valor === 'pozo' || valor === 'finca'
}

/**
 * A qué formulario se vuelve después de marcar el punto.
 *
 * Devuelve SIEMPRE una ruta interna armada acá: los ids llegan por la URL, y
 * aceptar de ahí una ruta entera sería un redirect abierto. Que un id sea
 * inventado no importa — esa página tiene su propio guard y responde 404.
 */
export function destinoDeColocacion(
  modo: ModoColocacion,
  farmId: string | undefined,
  wellId: string | undefined,
): string {
  const finca = farmId ? encodeURIComponent(farmId) : undefined

  if (modo === 'finca') {
    return finca ? `/fincas/${finca}/editar` : '/fincas/nueva'
  }

  if (!finca) return '/fincas'

  return wellId
    ? `/fincas/${finca}/pozos/${encodeURIComponent(wellId)}/editar`
    : `/fincas/${finca}/pozos/nuevo`
}

/** Un valor de texto que llegó por la URL, o null si vino vacío. */
export function textoDeUrl(valor: string | string[] | undefined): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null
}

/**
 * Una coordenada que llegó por la URL.
 *
 * Viene del mapa, pero la URL la escribe cualquiera: si no es un número dentro
 * del rango se descarta en silencio y el formulario abre como si no hubiera
 * venido nada. Mostrar un error no tendría sentido — el usuario no escribió
 * eso.
 */
export function coordenadaDeUrl(
  valor: string | string[] | undefined,
  tope: number,
): string | null {
  if (typeof valor !== 'string') return null
  // Number('') es 0, así que sin esto una coordenada vacía se convertía en
  // 0,0 — el golfo de Guinea — y el formulario abría "ubicado" en el mar.
  if (valor.trim() === '') return null

  const n = Number(valor)
  if (!Number.isFinite(n) || Math.abs(n) > tope) return null

  // Se guarda con 7 decimales: más dígitos serían una precisión inventada.
  return n.toFixed(7)
}

/** Latitud y longitud del mapa, o nada. Una sola coordenada no ubica nada. */
export function ubicacionDeUrl(query: Record<string, string | string[] | undefined>) {
  const latitude = coordenadaDeUrl(query.lat, 90)
  const longitude = coordenadaDeUrl(query.lon, 180)

  return latitude !== null && longitude !== null
    ? { latitude, longitude, desdeMapa: true as const }
    : { latitude: null, longitude: null, desdeMapa: false as const }
}
