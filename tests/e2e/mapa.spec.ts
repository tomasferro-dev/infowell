import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * El mapa satelital.
 *
 * Lo que más importa acá NO es que se vea la imagen sino que el mapa respete
 * el mismo cerco que el resto de la app: es una vista que junta TODAS las
 * fincas en una sola pantalla, así que un filtro mal puesto no se vería como
 * una fuga — se vería como un par de pines de más.
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

/** El mapa existe recién cuando maplibre terminó de montarse. */
async function esperarMapa(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
}

test.describe('llegar al mapa', () => {
  test('el inicio ofrece un botón ancho que lleva al mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.getByRole('link', { name: 'Ir al mapa' }).click()
    await expect(page).toHaveURL('/mapa')

    await esperarMapa(page)
  })
})

test.describe('los puntos del mapa', () => {
  test('dibuja las fincas y, al acercarse, sus pozos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    // De lejos los pozos se esconden: están a metros del casco y los pines se
    // pisarían entre sí. Ver ZOOM_POZOS en mapa.tsx.
    await expect(page.locator('.marcador-mapa[data-tipo="finca"]').first()).toBeVisible()
    await expect(
      page.locator('.marcador-mapa[data-tipo="pozo"]:not([data-oculto="true"])'),
    ).toHaveCount(0)

    // Al abrir una finca el mapa se acerca, y ahí sí aparecen sus pozos.
    await page.locator('.marcador-mapa[data-tipo="finca"]').first().click()
    await expect(
      page.locator('.marcador-mapa[data-tipo="pozo"]:not([data-oculto="true"])').first(),
    ).toBeVisible()
  })

  test('la ficha del pozo trae su último estado y las acciones', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    await page.locator('.marcador-mapa[data-tipo="finca"]').first().click()
    const pozo = page
      .locator('.marcador-mapa[data-tipo="pozo"]:not([data-oculto="true"])')
      .first()
    await expect(pozo).toBeVisible()
    await pozo.click()

    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    // Las mediciones, que es a lo que se va: no alcanza con el nombre.
    await expect(ficha.getByText('Profundidad')).toBeVisible()
    await expect(ficha.getByText('Nivel estático')).toBeVisible()
    await expect(ficha.getByText('Caudal')).toBeVisible()

    // Y se puede cargar trabajo sin salir del mapa.
    await expect(ficha.getByRole('link', { name: 'Cargar una intervención' })).toBeVisible()
  })

  test('el punto elegido queda a la vista y no detrás de la ficha', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    await page.locator('.marcador-mapa[data-tipo="finca"]').first().click()
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // Es el punto del feature: la ficha ocupa el 70% de abajo, así que el
    // mapa tiene que reencuadrar o el usuario mira un punto que no ve.
    await expect(async () => {
      const tapado = await page.evaluate(() => {
        const activo = document.querySelector('.marcador-mapa[data-activo="true"]')
        const ficha = document.querySelector('[data-vaul-drawer]')
        if (!activo || !ficha) return true
        return activo.getBoundingClientRect().bottom > ficha.getBoundingClientRect().top
      })
      expect(tapado).toBe(false)
    }).toPass({ timeout: 10_000 })
  })

  test('con la ficha abierta el mapa sigue respondiendo', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    await page.locator('.marcador-mapa[data-tipo="finca"]').first().click()
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // vaul se apoya en Radix, que apaga los eventos del body aunque el drawer
    // sea no-modal. Si esto se rompe, tocar otro punto deja de funcionar y no
    // hay ningún error que lo delate. Se toca sin force a propósito.
    const pozo = page
      .locator('.marcador-mapa[data-tipo="pozo"]:not([data-oculto="true"])')
      .first()
    await expect(pozo).toBeVisible()
    await pozo.click()

    await expect(page.locator('[data-vaul-drawer]').getByText('Profundidad')).toBeVisible()
  })
})

test.describe('el mapa respeta el alcance de cada rol', () => {
  test('el CLIENTE solo ve los puntos de su finca', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/mapa')

    // La finca ajena del fixture NO tiene por qué aparecer en ninguna forma.
    await expect(page.getByText(`${marca} Finca Ajena`)).toHaveCount(0)

    // Y el payload que viaja al navegador tampoco puede traerla: el mapa manda
    // TODAS las coordenadas al cliente de una, así que filtrar en la vista no
    // alcanzaría.
    const html = await page.content()
    expect(html).not.toContain(datos.fincaAjenaId)
    expect(html).not.toContain(datos.pozoAjenoId)
  })

  test('el CARGADOR tampoco alcanza las fincas que no tiene asignadas', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto('/mapa')

    const html = await page.content()
    expect(html).not.toContain(datos.fincaAjenaId)
    expect(html).not.toContain(datos.pozoAjenoId)
  })
})
