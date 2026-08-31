import { expect, test } from '@playwright/test'

import {
  elegir,
  escribir,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  type DatosTest,
} from './helpers'

/**
 * Dibujos sobre el mapa.
 *
 * Existen porque el mapa base no alcanza: el callejón de tierra que lleva a la
 * finca no figura en ningún lado, y el límite con el vecino no está marcado en
 * el terreno.
 *
 * Se verifica que se DIBUJEN, no solo que se guarden. Es una distinción que
 * costó cara: durante un buen rato los dibujos se guardaban bien, las capas
 * existían con sus datos, estaban visibles y arriba de todo, y no se veía nada
 * —faltaba el worker de maplibre—. Un test que solo mirara la base habría
 * pasado en verde todo ese tiempo.
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

async function esperarMapa(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
}

/** Cuántas formas está pintando el mapa ahora mismo. */
async function pintadas(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as {
        __mapa?: { queryRenderedFeatures(p?: unknown, o?: unknown): unknown[] }
      }
    ).__mapa

    if (!m) return -1

    return m.queryRenderedFeatures(undefined, {
      layers: ['anotaciones-relleno', 'anotaciones-linea', 'anotaciones-punto'],
    }).length
  })
}

/** Abre el mapa en la finca del fixture y despliega sus herramientas. */
async function abrirHerramientas(page: import('@playwright/test').Page) {
  await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
  await esperarMapa(page)

  await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
  await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

  // Las herramientas están más abajo en la ficha: hay que subirla.
  const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y + agarre.height / 2)
  await page.mouse.down()
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y - 400, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

/**
 * Elige una herramienta y espera a que el mapa entre en modo dibujo.
 *
 * Con `elegir` y no con un click suelto: el botón vive en la ficha, que es
 * cliente, y el primer toque puede caer antes de la hidratación y no hacer
 * nada. Reintentar es seguro — elegir la misma herramienta dos veces es lo
 * mismo que elegirla una.
 */
async function herramienta(page: import('@playwright/test').Page, nombre: RegExp) {
  const barra = page.locator('[data-dibujando="true"]')
  await elegir(page.getByRole('button', { name: nombre }), () =>
    expect(barra).toBeVisible({ timeout: 2000 }),
  )
  return barra
}

/** Toca el mapa en una posición relativa a su recuadro. */
async function tocarMapa(page: import('@playwright/test').Page, x: number, y: number) {
  const caja = (await page.locator('[data-listo="true"]').boundingBox())!
  await page.mouse.click(caja.x + caja.width * x, caja.y + caja.height * y)
  await page.waitForTimeout(400)
}

test.describe('dibujar sobre el mapa', () => {
  test('un rectángulo se marca en dos toques y queda dibujado', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    await herramienta(page, /Rectángulo/)
    // La ficha se va: el mapa tiene que quedar entero para dibujar.
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)

    await tocarMapa(page, 0.25, 0.2)
    await tocarMapa(page, 0.75, 0.45)

    // Dos toques y cierra solo: pedirle además «Listo» sería un paso de más.
    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()

    await escribir(panel.getByLabel('Nombre'), `Cuadro ${marca}`)
    await panel.getByRole('radio', { name: 'celeste' }).click()
    await panel.getByRole('checkbox').check()
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByText('Dibujo guardado')).toBeVisible()

    // Y se VE. No alcanza con que esté guardado.
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('un perímetro se arma punto por punto y se puede deshacer', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const barra = await herramienta(page, /Perímetro/)

    // Con menos de tres puntos no hay perímetro que valga.
    const listo = barra.getByRole('button', { name: 'Listo' })
    await tocarMapa(page, 0.3, 0.2)
    await tocarMapa(page, 0.7, 0.25)
    await expect(listo).toBeDisabled()

    await tocarMapa(page, 0.6, 0.5)
    await expect(listo).toBeEnabled()

    // Deshacer devuelve al estado anterior, sin cancelar todo el dibujo.
    await barra.getByRole('button', { name: 'Deshacer el último punto' }).click()
    await expect(listo).toBeDisabled()
    await expect(barra).toBeVisible()

    await tocarMapa(page, 0.55, 0.55)
    await listo.click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await escribir(panel.getByLabel('Nombre'), `Perímetro ${marca}`)
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('una referencia suelta se marca con un toque y lleva su explicación', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const barra = await herramienta(page, /Referencia/)
    await tocarMapa(page, 0.5, 0.3)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await escribir(panel.getByLabel('Nombre'), `Entrada ${marca}`)
    await escribir(
      panel.getByLabel('Cómo se llega'),
      'Sobre la ruta, doblar a la derecha en el callejón de tierra.',
    )
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('se puede cancelar sin guardar nada', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const antes = await pintadas(page)

    const barra = await herramienta(page, /Línea/)
    await tocarMapa(page, 0.3, 0.3)
    await tocarMapa(page, 0.6, 0.4)

    await barra.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.locator('[data-dibujando="true"]')).toHaveCount(0)
    await expect(page.locator('[data-panel-dibujo="true"]')).toHaveCount(0)
    await expect.poll(() => pintadas(page)).toBe(antes)
  })

  test('los dibujos se pueden apagar cuando estorban', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    // Primero uno, para tener algo que apagar.
    await herramienta(page, /Rectángulo/)
    await tocarMapa(page, 0.25, 0.2)
    await tocarMapa(page, 0.75, 0.45)

    const panel = page.locator('[data-panel-dibujo="true"]')
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)

    // Con muchos encimados tapan la imagen: se apagan de una.
    await page.getByRole('button', { name: 'Dibujos' }).click()
    await expect.poll(() => pintadas(page)).toBe(0)

    await page.getByRole('button', { name: 'Ocultos' }).click()
    await expect.poll(() => pintadas(page)).toBeGreaterThan(0)
  })
})

test.describe('la ficha no se queda con la app', () => {
  test('al cerrarla, la página vuelve a existir para un lector de pantalla', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    // Abrir la ficha y entrar a dibujar: vaul marca el resto de la página con
    // aria-hidden y no siempre lo limpia. Se veía todo bien en pantalla y la
    // app entera había desaparecido para quien usa lector de pantalla.
    await herramienta(page, /Línea/)

    const raizOculta = await page.evaluate(() =>
      Boolean(document.querySelector('main')?.closest('[aria-hidden="true"]')),
    )
    expect(raizOculta, 'la app no puede quedar oculta para el lector').toBe(false)

    // Y los botones de la barra son alcanzables por su rol, que es la prueba
    // de que están en el árbol de accesibilidad.
    await expect(
      page.locator('[data-dibujando="true"]').getByRole('button', { name: 'Cancelar' }),
    ).toBeVisible()
  })
})

test.describe('quién puede dibujar', () => {
  test('el CLIENTE ve los dibujos pero no puede hacer ninguno', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    // Es de solo lectura: el mapa le sirve para orientarse, no para escribir.
    await expect(ficha.getByText('Dibujar en el mapa')).toHaveCount(0)
    await expect(ficha.getByRole('button', { name: /Rectángulo/ })).toHaveCount(0)
  })
})
