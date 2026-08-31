/**
 * Dibujos sobre el mapa.
 *
 * Todo lo de este archivo es puro: no toca la base, ni el mapa, ni el DOM. Un
 * error de geometría no se ve como un error sino como un dibujo raro, así que
 * conviene poder probarlo sin levantar nada.
 */

export const FORMAS = ['PUNTO', 'LINEA', 'POLIGONO'] as const
export type Forma = (typeof FORMAS)[number]

/** Cómo se dibuja cada forma, en palabras del oficio. */
export const NOMBRE_DE_FORMA: Record<Forma, string> = {
  PUNTO: 'Referencia',
  LINEA: 'Línea',
  POLIGONO: 'Perímetro',
}

/**
 * La paleta.
 *
 * Cerrada a propósito. Con un selector libre de color, en dos semanas el mapa
 * es un arcoíris y deja de leerse. Estos cinco se distinguen entre sí y contra
 * la imagen satelital, que es verde, marrón y gris.
 */
export const COLORES = {
  rojo: '#e11d2f',
  naranja: '#f97316',
  amarillo: '#facc15',
  celeste: '#0ea5e9',
  violeta: '#a855f7',
} as const

export type ClaveColor = keyof typeof COLORES

export const CLAVES_COLOR = Object.keys(COLORES) as ClaveColor[]

export function esClaveColor(valor: unknown): valor is ClaveColor {
  return typeof valor === 'string' && valor in COLORES
}

/** El color de una anotación; si la clave es desconocida, el primero. */
export function colorDe(clave: string): string {
  return esClaveColor(clave) ? COLORES[clave] : COLORES.rojo
}

/** Un par [lon, lat]. El orden es el de GeoJSON, al revés del que se habla. */
export type Punto = [number, number]

export function esPunto(valor: unknown): valor is Punto {
  return (
    Array.isArray(valor) &&
    valor.length === 2 &&
    typeof valor[0] === 'number' &&
    typeof valor[1] === 'number' &&
    Number.isFinite(valor[0]) &&
    Number.isFinite(valor[1]) &&
    Math.abs(valor[0]) <= 180 &&
    Math.abs(valor[1]) <= 90
  )
}

/** Cuántos puntos necesita cada forma para existir. */
export const MINIMO_DE_PUNTOS: Record<Forma, number> = {
  PUNTO: 1,
  LINEA: 2,
  POLIGONO: 3,
}

/**
 * Tope de puntos por dibujo.
 *
 * No es una restricción de la base sino del sentido común: un perímetro de mil
 * vértices no lo dibujó nadie con el dedo, y sí puede llegar de un cliente
 * modificado. Doscientos alcanzan de sobra para el contorno de una finca.
 */
export const MAXIMO_DE_PUNTOS = 200

export type ErrorGeometria = { ok: false; error: string }
export type GeometriaValida = { ok: true; forma: Forma; puntos: Punto[] }

/**
 * Valida los puntos de un dibujo y los normaliza.
 *
 * Devuelve SIEMPRE un arreglo de puntos, también para PUNTO: que la forma
 * cambie el tipo del dato obliga a ramificar en cada lugar que lo toca.
 */
export function validarGeometria(forma: Forma, crudo: unknown): GeometriaValida | ErrorGeometria {
  const puntos = forma === 'PUNTO' && esPunto(crudo) ? [crudo] : crudo

  if (!Array.isArray(puntos)) return { ok: false, error: 'El dibujo no tiene puntos' }

  if (!puntos.every(esPunto)) {
    return { ok: false, error: 'Alguno de los puntos no es una coordenada válida' }
  }

  const minimo = MINIMO_DE_PUNTOS[forma]
  if (puntos.length < minimo) {
    return {
      ok: false,
      error:
        minimo === 1
          ? 'Falta marcar el punto'
          : `Un ${NOMBRE_DE_FORMA[forma].toLowerCase()} necesita al menos ${minimo} puntos`,
    }
  }

  if (puntos.length > MAXIMO_DE_PUNTOS) {
    return { ok: false, error: `Son demasiados puntos (máximo ${MAXIMO_DE_PUNTOS})` }
  }

  return { ok: true, forma, puntos: puntos as Punto[] }
}

/**
 * Los cuatro vértices de un rectángulo, a partir de dos esquinas opuestas.
 *
 * El rectángulo no es una forma propia: se guarda como perímetro. Lo que
 * cambia es cómo se dibuja — dos toques en vez de recorrer el contorno—, que
 * es justamente lo que lo hace rápido para marcar una finca a grandes rasgos.
 */
export function rectangulo(a: Punto, b: Punto): Punto[] {
  return [
    [a[0], a[1]],
    [b[0], a[1]],
    [b[0], b[1]],
    [a[0], b[1]],
  ]
}

/** Un punto representativo, para poner la etiqueta o encuadrar el dibujo. */
export function centroDe(puntos: Punto[]): Punto {
  const suma = puntos.reduce<[number, number]>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])

  return [suma[0] / puntos.length, suma[1] / puntos.length]
}

/** Los extremos del dibujo, para que el mapa lo pueda encuadrar entero. */
export function limitesDe(puntos: Punto[]): { oeste: number; sur: number; este: number; norte: number } {
  const lons = puntos.map((p) => p[0])
  const lats = puntos.map((p) => p[1])

  return {
    oeste: Math.min(...lons),
    sur: Math.min(...lats),
    este: Math.max(...lons),
    norte: Math.max(...lats),
  }
}
