import { expect, test } from '@playwright/test'

import {
  borrarImagenes,
  escribir,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  type DatosTest,
} from './helpers'

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
 * Cada test arranca sin imágenes.
 *
 * Todos trabajan sobre la MISMA finca, así que sin esto el segundo ve la que
 * dejó el primero: las aserciones sobre cuántas capas hay dan de más, y un
 * `[data-abrir-imagen]` que debería ser uno pasa a ser tres. Es la misma razon
 * por la que los tests de dibujo empiezan con el mapa limpio.
 */
test.beforeEach(() => {
  borrarImagenes(marca)
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

test.describe('guardar la imagen calzada', () => {
  test('se sube, se guarda, y sigue en el mapa al volver a entrar', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()

    await page
      .locator('[data-calzar-imagen] input[type="file"]')
      .setInputFiles('tests/e2e/fixtures-imagen-mapa.png')
    await expect(page.getByText('Calzar la imagen')).toBeVisible()

    // Mover el mapa: así las esquinas que se guardan no son las de arranque.
    await page.evaluate(() => {
      const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
      mapa?.jumpTo({ center: [mapa.getCenter().lng + 0.004, mapa.getCenter().lat] })
    })
    await page.waitForTimeout(300)

    const alGuardar = await posicionEnPantalla(page)
    expect(alGuardar, 'la imagen tiene que estar montada').not.toBeNull()

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Imagen guardada sobre el terreno.')).toBeVisible({
      timeout: 30_000,
    })

    // El panel se fue: el modo terminó.
    await expect(page.getByText('Calzar la imagen')).toBeHidden()

    // Y acá lo que de verdad importa: entrar de nuevo y que siga estando.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    const guardadas = await page.evaluate(async () => {
      const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
      if (!mapa) return null

      // La imagen se baja con fetch antes de dibujarse, así que se espera.
      for (let i = 0; i < 40; i++) {
        const capas = mapa
          .getStyle()
          .layers.filter((c) => c.id.startsWith('imagen-guardada-'))
        if (capas.length > 0) return capas.map((c) => c.id)
        await new Promise((r) => setTimeout(r, 250))
      }
      return []
    })

    expect(guardadas, 'la imagen guardada tiene que dibujarse al volver').toHaveLength(1)
  })
})

/** Los ids de las capas de imagen que hay dibujadas ahora mismo. */
async function capasDeImagen(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const mapa = (window as unknown as { __mapa?: import('maplibre-gl').Map }).__mapa
    if (!mapa) return []
    return mapa
      .getStyle()
      .layers.filter((c) => c.id.startsWith('imagen-guardada-'))
      .map((c) => c.id)
  })
}

/**
 * Abre la ficha de la finca y la sube del todo.
 *
 * La lista de imágenes vive abajo, después de los pozos y de los dibujos, así
 * que al tope por defecto queda fuera de la vista. Es la misma maniobra que
 * necesitan las herramientas de dibujo — ver `abrirHerramientas` en
 * dibujos.spec.ts—, o sea la interacción normal de la app y no una rareza del
 * test: la ficha se arrastra hacia arriba.
 */
async function abrirFichaEntera(page: import('@playwright/test').Page, fincaId: string) {
  await page.goto(`/mapa?punto=${fincaId}`)
  await esperarMapa(page)

  await page.locator(`.marcador-mapa[data-id="${fincaId}"]`).click()
  await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

  const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y + agarre.height / 2)
  await page.mouse.down()
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y - 400, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

/** Deja una imagen guardada sobre la finca propia y vuelve al mapa. */
async function dejarUnaImagenGuardada(page: import('@playwright/test').Page, fincaId: string) {
  await page.goto(`/mapa?punto=${fincaId}`)
  await esperarMapa(page)
  await page.locator(`.marcador-mapa[data-id="${fincaId}"]`).click()
  await page
    .locator('[data-calzar-imagen] input[type="file"]')
    .setInputFiles('tests/e2e/fixtures-imagen-mapa.png')
  await expect(page.getByText('Calzar la imagen')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Imagen guardada sobre el terreno.')).toBeVisible({
    timeout: 30_000,
  })
}

test.describe('administrar las imágenes guardadas', () => {
  test('se lista en la ficha, se apaga y deja de dibujarse', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await dejarUnaImagenGuardada(page, datos.fincaPropiaId)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await expect
      .poll(() => capasDeImagen(page), { timeout: 20_000 })
      .toHaveLength(1)

    await abrirFichaEntera(page, datos.fincaPropiaId)

    // Aparece en la lista de la finca, con su nombre.
    const fila = page.locator('[data-abrir-imagen]')
    await expect(fila).toHaveCount(1)
    await expect(fila).toContainText('fixtures-imagen-mapa')
    await expect(fila).toContainText('Se ve en el mapa')

    // Apagarla es un solo toque.
    await page.locator('[data-prender-imagen]').click()

    // Y deja de dibujarse: esto es lo que importa, no que cambie el rótulo.
    await expect.poll(() => capasDeImagen(page), { timeout: 20_000 }).toHaveLength(0)

    // Sigue en la lista, apagada: si desapareciera no habría cómo prenderla.
    await expect(page.locator('[data-abrir-imagen]')).toContainText('Apagada')
  })

  test('se le cambia el nombre y queda', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await dejarUnaImagenGuardada(page, datos.fincaPropiaId)

    await abrirFichaEntera(page, datos.fincaPropiaId)
    await page.locator('[data-abrir-imagen]').click()

    await expect(page.getByText('Imagen del terreno')).toBeVisible()
    await escribir(page.locator('#guardada-etiqueta'), 'Vuelo de marzo')
    await page.getByRole('button', { name: 'Guardar' }).click()

    // Entrar de nuevo: el nombre nuevo tiene que estar en la base, no solo en
    // la pantalla que ya lo tenía escrito.
    await abrirFichaEntera(page, datos.fincaPropiaId)
    await expect(page.locator('[data-abrir-imagen]')).toContainText('Vuelo de marzo')
  })

  test('se borra y desaparece del mapa y de la lista', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await dejarUnaImagenGuardada(page, datos.fincaPropiaId)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await expect.poll(() => capasDeImagen(page), { timeout: 20_000 }).toHaveLength(1)

    await abrirFichaEntera(page, datos.fincaPropiaId)
    await page.locator('[data-abrir-imagen]').click()
    await page.getByRole('button', { name: 'Borrar esta imagen' }).click()

    await expect(page.getByText('Imagen borrada.')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => capasDeImagen(page), { timeout: 20_000 }).toHaveLength(0)

    // Y tampoco vuelve al recargar: el borrado quedó en la base.
    await abrirFichaEntera(page, datos.fincaPropiaId)
    await expect(page.locator('[data-abrir-imagen]')).toHaveCount(0)
  })
})
