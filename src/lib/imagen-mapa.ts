import { esPunto, type Punto } from '@/lib/anotaciones'

/**
 * La imagen que el usuario calza sobre el mapa satelital.
 *
 * Existe porque la imagen de MapTiler sobre Mendoza es de 2023 (§11 de la
 * bitácora): un galpón nuevo o un cuadro replantado no están. La empresa tiene
 * un servicio que da imagen más nueva pero solo permite sacar capturas de
 * pantalla, sin georreferenciar — así que las coordenadas no vienen en el
 * archivo y las pone el usuario, arrastrando la imagen hasta que calza.
 */

/**
 * Los cuatro vértices, desde ARRIBA A LA IZQUIERDA y en sentido HORARIO.
 *
 * El orden no es una convención nuestra: es el que exige `ImageSource` de
 * MapLibre. Se guarda igual que como se consume para no traducir en el medio,
 * que es donde se cuelan los errores que después nadie encuentra.
 */
export type Esquinas = [Punto, Punto, Punto, Punto]

/**
 * Valida lo que llega antes de que toque la base.
 *
 * Las esquinas viajan como Json y Prisma no las mira. Si esto no corta, un
 * NaN entra sin quejarse y el error aparece mucho después, al dibujar, con un
 * mapa en blanco que no dice por qué.
 */
export function esEsquinas(valor: unknown): valor is Esquinas {
  return Array.isArray(valor) && valor.length === 4 && valor.every(esPunto)
}

/**
 * Arranca en 0,8 y no en opaco a propósito: la imagen se calza mirando las dos
 * capas a la vez. Una imagen opaca tapa justamente la referencia con la que el
 * usuario la está alineando.
 */
export const OPACIDAD_POR_DEFECTO = 0.8

export function esOpacidad(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 1
}
