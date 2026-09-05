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

/**
 * Con qué rectángulo de PANTALLA arranca la imagen al entrar a calzarla.
 *
 * La imagen se fija a la pantalla y el usuario mueve el mapa por debajo — el
 * mismo principio que el modo colocación de un pozo: el dedo tapa justo lo que
 * hay que mirar. Así, mover, acercar y girar el mapa mueven, escalan y giran
 * la imagen contra el terreno, con los gestos que el usuario ya sabe.
 *
 * Que arranque ocupando como mucho el 80% importa: si la imagen tapa toda la
 * pantalla no queda satelital alrededor contra el cual calzarla.
 */

/** Cuánto de la vista puede ocupar la imagen al arrancar. */
const PROPORCION_INICIAL = 0.8

/**
 * Cuánto de la pantalla ocupa el panel de calzado, como fracción.
 *
 * Vive acá y no en el componente porque lo usan los dos: el panel para su
 * alto máximo y este cálculo para reservar el espacio. Separados, se
 * desincronizan y la imagen vuelve a arrancar debajo del panel.
 */
export const ALTO_PANEL_CALZADO = 0.38

export function rectanguloInicial({
  anchoImagen,
  altoImagen,
  ancho,
  alto,
  reservadoAbajo = 0,
}: {
  anchoImagen: number
  altoImagen: number
  ancho: number
  alto: number
  /** Franja de abajo tapada por el panel. La imagen se centra en lo que sobra. */
  reservadoAbajo?: number
}): { x: number; y: number; ancho: number; alto: number } {
  // Una imagen sin medidas útiles no puede deformar el cálculo: se la trata
  // como cuadrada. Pasa con un archivo roto, y es mejor mostrarlo torcido que
  // no mostrar nada.
  const w = Number.isFinite(anchoImagen) && anchoImagen > 0 ? anchoImagen : 1
  const h = Number.isFinite(altoImagen) && altoImagen > 0 ? altoImagen : 1

  // Lo que el panel no tapa. Nunca menos de un cuarto de la pantalla: un
  // panel absurdo no puede dejar la imagen en cero.
  const visible = Math.max(alto - Math.max(reservadoAbajo, 0), alto * 0.25)

  const disponibleAncho = ancho * PROPORCION_INICIAL
  const disponibleAlto = visible * PROPORCION_INICIAL

  // El menor de los dos factores es el que hace que entre por los dos lados.
  const factor = Math.min(disponibleAncho / w, disponibleAlto / h)

  const anchoFinal = w * factor
  const altoFinal = h * factor

  return {
    x: (ancho - anchoFinal) / 2,
    // Centrada en la franja visible, no en el lienzo entero.
    y: (visible - altoFinal) / 2,
    ancho: anchoFinal,
    alto: altoFinal,
  }
}
