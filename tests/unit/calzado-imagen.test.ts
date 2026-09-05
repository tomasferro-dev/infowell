import { describe, expect, it } from 'vitest'

import { rectanguloInicial, rutaEsDeLaFinca } from '@/lib/imagen-mapa'

/**
 * Dónde arranca la imagen en la pantalla cuando se entra a calzarla.
 *
 * Es matemática pura y por eso se prueba acá: el error clásico —deformar la
 * imagen al encajarla— no se ve como un error, se ve como una imagen que
 * «no coincide con nada», y el usuario cree que la sacó mal.
 */

const VISTA = { ancho: 400, alto: 800 }

describe('el rectángulo con el que arranca la imagen', () => {
  it('conserva la proporción de la imagen', () => {
    const r = rectanguloInicial({ anchoImagen: 1000, altoImagen: 500, ...VISTA })
    expect(r.ancho / r.alto).toBeCloseTo(2, 5)
  })

  it('conserva la proporción también cuando la imagen es alta', () => {
    const r = rectanguloInicial({ anchoImagen: 500, altoImagen: 1000, ...VISTA })
    expect(r.ancho / r.alto).toBeCloseTo(0.5, 5)
  })

  it('entra en la vista, con margen', () => {
    for (const img of [
      { anchoImagen: 4000, altoImagen: 3000 },
      { anchoImagen: 300, altoImagen: 4000 },
      { anchoImagen: 1, altoImagen: 1 },
    ]) {
      const r = rectanguloInicial({ ...img, ...VISTA })
      expect(r.ancho, JSON.stringify(img)).toBeLessThan(VISTA.ancho)
      expect(r.alto, JSON.stringify(img)).toBeLessThan(VISTA.alto)
      expect(r.x).toBeGreaterThan(0)
      expect(r.y).toBeGreaterThan(0)
    }
  })

  it('queda centrado en la vista', () => {
    const r = rectanguloInicial({ anchoImagen: 1000, altoImagen: 500, ...VISTA })
    expect(r.x + r.ancho / 2).toBeCloseTo(VISTA.ancho / 2, 5)
    expect(r.y + r.alto / 2).toBeCloseTo(VISTA.alto / 2, 5)
  })

  /**
   * Una imagen enorme no puede arrancar ocupando toda la pantalla: si no se
   * ve nada del satelital alrededor, no hay contra qué calzarla.
   */
  it('nunca ocupa la vista entera', () => {
    const r = rectanguloInicial({ anchoImagen: 8000, altoImagen: 8000, ...VISTA })
    expect(r.ancho).toBeLessThanOrEqual(VISTA.ancho * 0.8)
  })

  it('no revienta con medidas imposibles', () => {
    for (const caso of [
      { anchoImagen: 0, altoImagen: 100 },
      { anchoImagen: 100, altoImagen: 0 },
      { anchoImagen: -5, altoImagen: 100 },
      { anchoImagen: NaN, altoImagen: 100 },
    ]) {
      const r = rectanguloInicial({ ...caso, ...VISTA })
      expect(Number.isFinite(r.ancho), JSON.stringify(caso)).toBe(true)
      expect(r.ancho, JSON.stringify(caso)).toBeGreaterThan(0)
      expect(r.alto, JSON.stringify(caso)).toBeGreaterThan(0)
    }
  })
})

describe('el espacio que tapa el panel', () => {
  /**
   * El panel de calzado ocupa la franja de abajo. Sin reservarla, la imagen
   * arranca centrada en el lienzo entero y su mitad inferior queda detrás del
   * panel — no se puede alinear lo que no se ve. Se descubrió mirando una
   * captura, no con una aserción.
   */
  it('centra la imagen en lo que queda visible, no en el lienzo entero', () => {
    const sinPanel = rectanguloInicial({
      anchoImagen: 100,
      altoImagen: 100,
      ancho: 400,
      alto: 800,
      reservadoAbajo: 0,
    })
    const conPanel = rectanguloInicial({
      anchoImagen: 100,
      altoImagen: 100,
      ancho: 400,
      alto: 800,
      reservadoAbajo: 300,
    })

    // Con el panel abajo, la imagen sube.
    expect(conPanel.y + conPanel.alto / 2).toBeLessThan(sinPanel.y + sinPanel.alto / 2)
    // Y queda centrada en los 500 que sobran.
    expect(conPanel.y + conPanel.alto / 2).toBeCloseTo(250, 0)
  })

  it('la imagen entera queda por encima del panel', () => {
    const r = rectanguloInicial({
      anchoImagen: 300,
      altoImagen: 900,
      ancho: 400,
      alto: 800,
      reservadoAbajo: 300,
    })
    expect(r.y + r.alto).toBeLessThanOrEqual(500)
    expect(r.y).toBeGreaterThan(0)
  })

  it('sin reserva se comporta como antes', () => {
    const conCero = rectanguloInicial({ anchoImagen: 200, altoImagen: 100, ancho: 400, alto: 800, reservadoAbajo: 0 })
    expect(conCero.y + conCero.alto / 2).toBeCloseTo(400, 5)
  })

  /** Un panel absurdo no puede dejar la imagen en cero o negativa. */
  it('no revienta si el panel dice tapar toda la pantalla', () => {
    const r = rectanguloInicial({
      anchoImagen: 200,
      altoImagen: 100,
      ancho: 400,
      alto: 800,
      reservadoAbajo: 900,
    })
    expect(r.ancho).toBeGreaterThan(0)
    expect(r.alto).toBeGreaterThan(0)
    expect(Number.isFinite(r.y)).toBe(true)
  })
})

describe('la ruta del archivo tiene que ser de esa finca', () => {
  /**
   * La ruta la manda el navegador. Sin este control, alguien que puede
   * escribir su propia finca podría guardar un MapOverlay apuntando a la
   * carpeta de otra: la fila diría que es suya y el archivo sería ajeno, y la
   * ruta de lectura firmaría contra el farmId de la ruta, no el de la fila.
   */
  it('acepta una ruta cuyo primer segmento es la finca', () => {
    expect(rutaEsDeLaFinca('finca-a/img-1/abc.png', 'finca-a')).toBe(true)
  })

  it('RECHAZA la ruta de otra finca', () => {
    expect(rutaEsDeLaFinca('finca-b/img-1/abc.png', 'finca-a')).toBe(false)
  })

  it('rechaza rutas malformadas o con salto de directorio', () => {
    for (const ruta of [
      '',
      '/finca-a/img/abc.png',
      'finca-a/abc.png',
      '../finca-b/img/abc.png',
      'finca-a/../finca-b/img/abc.png',
      'finca-a\img\abc.png',
    ]) {
      expect(rutaEsDeLaFinca(ruta, 'finca-a'), ruta).toBe(false)
    }
  })

  it('rechaza si falta la finca', () => {
    expect(rutaEsDeLaFinca('finca-a/img/abc.png', '')).toBe(false)
  })

  /** Un prefijo que se parece no alcanza: tiene que ser el segmento entero. */
  it('no se conforma con que la ruta empiece parecido', () => {
    expect(rutaEsDeLaFinca('finca-a2/img/abc.png', 'finca-a')).toBe(false)
    expect(rutaEsDeLaFinca('finca-a/img/abc.png', 'finca-a2')).toBe(false)
  })
})
