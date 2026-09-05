import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Calzar una imagen sobre el terreno.
 *
 * Lo que se prueba acá NO es que la capa exista —eso da verde sin que se vea
 * nada— sino la mecánica: la imagen queda clavada a la PANTALLA y el mapa se
 * mueve por debajo. Si eso se rompe, la imagen se va con el terreno y calzarla
 * se vuelve imposible.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

let datos: DatosTest

test.beforeAll(() => {
  datos = montarDatos(marca)
})

test.afterAll(() => {
  limpiarDatos(marca)
})

/**
 * Un PNG real de 200x100, generado con sharp.
 *
 * No cuadrado a propósito: una imagen cuadrada no delata si se deforma al
 * encajarla, y deformarla es el error que el usuario no lee como un error
 * — lee que la imagen «no coincide con nada» y cree que la sacó mal.
 */
const PNG_PRUEBA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAACXBIWXMAAAsTAAALEwEAmpwYAAAD' +
    'F0lEQVR4nO3Xsa3dQBBD0deJoulhYLj/arYH/diAnRiGSfw9AXOB5J0VP+eZl3igA/NbDz6MAYcO' +
    'zB89AAhAAPIARAkcgvdvPPCCKI7j8QBECRyC1wuiBA7B82898IsFKlA9AFECh+D1giiBQ/D4xVIC' +
    'h+D9Xx7YIMrm4DwAUQKH4PWCKIFD8PjFUgKH4LVBlMAhePIeGOkFIdDUegCQghBoaj0ASEEINLUe' +
    'AKQgBJpaDwBSEAJNrQcAKQiBptYDgBSEQFPrAUAKQqCp9QAgBSHQ1HrwbQDZHz+pyINT0AmAACQO' +
    'wgIkT7EXJF/4BUi+5ADJFxsg80sPbZCCMn1HnYKjaYPYIHEQFiB5im2QfOEXIPmSAyRfbICMDZIu' +
    'zw06BUfTBrFB4iAsQPIU2yD5wi9A8iUHSL7YABkbJF2eG3QKjqYNYoPEQViA5Cm2QfKFX4DkSw6Q' +
    'fLEBMjZIujw36BQcTRvEBomDsADJU2yD5Au/AMmXHCD5YgNkbJB0eW7QKTiaNogNEgdhAZKn2AbJ' +
    'F34Bki85QPLFBsjYIOny3KBTcDRtEBskDsICJE+xDZIv/AIkX3KA5IsNkLFB0uW5QafgaNogNkgc' +
    'hAVInmIbJF/4BUi+5ADJFxsgY4Oky3ODTsHRtEFskDgIC5A8xTZIvvALkHzJAZIvNkDGBkmX5wad' +
    'gqNpg9ggcRAWIHmKbZB84Rcg+ZIDJF9sgIwNki7PDToFR9MGsUHiICxA8hTbIPnCL0DyJQdIvtgA' +
    'GRskXZ4bdAqOpg1ig8RBWIDkKbZB8oVfgORLDpB8sQEyNki6PDfoFBxNG8QGiYOwAMlTTDw4XhAl' +
    'cAimzoNP+gOIB6fYA4AUhEBT6wFACkKgqfUAIAUh0NR6AJCCEKjXA4AUhEBT6wFACkKgqfUAIAUh' +
    '0NR6AJCCEGhqPQBIQQg0tR4ApCAEmloPAFIQAk2tBwApCIGm1gOAFIRAU+sBQApCoKn1ACAFIdDU' +
    'egCQghBoaj0ASEEINLUeAKQgBJpaDwBSEAJNrQcAKQiBptYDgBSEQFPrAUAKQqCp9eALD7S2MXXX' +
    '5nEAAAAASUVORK5CYII=',
  'base64',
)

const PROPORCION = 2

async function esperarMapa(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
}

/** Dónde está la imagen en PANTALLA, en píxeles del lienzo. */
async function posicionEnPantalla(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
    if (!mapa) return null

    const fuente = mapa.getSource('imagen-calzada')
    if (!fuente) return null

    const esquinas = (fuente as unknown as { coordinates: [number, number][] }).coordinates
    // De vuelta a píxeles: es el espacio donde la imagen NO se tiene que mover.
    return esquinas.map((c) => {
      const p = mapa.project(c)
      return [Math.round(p.x), Math.round(p.y)]
    })
  })
}

test.describe('calzar una imagen', () => {
  test('la imagen queda clavada a la pantalla mientras el mapa se mueve debajo', async ({
    page,
  }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    // La finca elegida es de donde sale el farmId de la imagen.
    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()

    // El botón vive DENTRO de la ficha de la finca: al elegir una finca la
    // ficha tapa los controles flotantes del mapa, así que uno ahí arriba no
    // se podría alcanzar nunca.
    await expect(page.locator("[data-calzar-imagen]")).toBeVisible()

    // El input vive DENTRO del label de la ficha, así que de ahí sale el
    // farmId. Se lo carga directo: no hay clic programático ni diálogo nativo.
    await page.locator('[data-calzar-imagen] input[type="file"]').setInputFiles({
      name: 'captura-satelital.png',
      mimeType: 'image/png',
      buffer: PNG_PRUEBA,
    })

    await expect(page.getByText('Calzar la imagen')).toBeVisible()

    const antes = await posicionEnPantalla(page)
    expect(antes, 'la imagen tiene que estar montada').not.toBeNull()

    // No se deformó al encajarla: el ancho sobre el alto sigue siendo el de
    // la imagen. Deformarla no se lee como un error — se lee como que la foto
    // «no coincide con nada».
    const anchoPx = antes![1]![0]! - antes![0]![0]!
    const altoPx = antes![3]![1]! - antes![0]![1]!
    expect(anchoPx / altoPx).toBeCloseTo(PROPORCION, 1)

    // El mapa se mueve MUCHO por debajo.
    await page.evaluate(() => {
      const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
      mapa?.jumpTo({ center: [mapa.getCenter().lng + 0.02, mapa.getCenter().lat + 0.02] })
    })
    await page.waitForTimeout(300)

    const despues = await posicionEnPantalla(page)

    // En píxeles de pantalla NO se movió: eso es estar clavada.
    expect(despues).toEqual(antes)
  })

  test('acercar el mapa tampoco la mueve de la pantalla', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    // Por data-id y NUNCA por índice: el admin ve los marcadores de TODAS las
    // fincas, incluidas las de las corridas que van en paralelo, así que «el
    // primero» puede ser el de otro worker — o uno fuera de pantalla.
    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()

    // El input vive DENTRO del label de la ficha, así que de ahí sale el
    // farmId. Se lo carga directo: no hay clic programático ni diálogo nativo.
    await page.locator('[data-calzar-imagen] input[type="file"]').setInputFiles({
      name: 'captura-satelital.png',
      mimeType: 'image/png',
      buffer: PNG_PRUEBA,
    })
    await expect(page.getByText('Calzar la imagen')).toBeVisible()

    const antes = await posicionEnPantalla(page)
    // Sin esto, si la imagen no monta el test compara null con null y pasa
    // sin haber probado nada. Ya me pasó una vez en este mismo archivo.
    expect(antes, 'la imagen tiene que estar montada').not.toBeNull()

    await page.evaluate(() => {
      const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
      mapa?.jumpTo({ zoom: (mapa.getZoom() ?? 14) + 2, bearing: 35 })
    })
    await page.waitForTimeout(300)

    // Acercar dos niveles y girar 35°: en el terreno la imagen cambió de
    // escala y de rotación, que es justo lo que el usuario quiere. En la
    // pantalla, no se movió ni un píxel.
    expect(await posicionEnPantalla(page)).toEqual(antes)
  })
})
