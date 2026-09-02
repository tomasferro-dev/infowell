import { expect, test } from '@playwright/test'

import {
  archivarFincaPropia,
  elegir,
  escribir,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  type DatosTest,
} from './helpers'

/**
 * El aviso de lo que todavía no está en el mapa.
 *
 * Antes era una franja fija que decía «faltan ubicar 2 registros» y nada más:
 * el usuario se enteraba del problema pero no de cuál era ni de cómo
 * arreglarlo, no podía cerrarla, y encima tapaba los botones de dibujo.
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

/** Un pozo sin ubicación, que es lo que hace aparecer el aviso. */
async function crearPozoSinUbicar(page: import('@playwright/test').Page, nombre: string) {
  await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)
  await escribir(page.getByLabel('Nombre del pozo'), nombre)
  await page.getByRole('button', { name: 'Crear pozo' }).click()
  await expect(page).toHaveURL(`/fincas/${datos.fincaPropiaId}`)
}

test.describe('lo que falta ubicar', () => {
  test('dice cuáles son y lleva a cada uno', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const nombre = `Pozo sin GPS ${marca}`
    await crearPozoSinUbicar(page, nombre)

    await page.goto('/mapa')
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })

    // La chapita dice cuántos, no ocupa el ancho entero y se toca.
    const chapa = page.getByRole('button', { name: /sin ubicar/ })
    await expect(chapa).toBeVisible()
    await chapa.click()

    // Y ahí sí: nombre y propiedad, no un número suelto.
    const item = page.getByRole('link', { name: new RegExp(nombre) })
    await expect(item).toBeVisible()

    // Lo importante: lleva al formulario donde se arregla.
    await item.click()
    await expect(page).toHaveURL(/\/pozos\/[^/]+\/editar$/)
    await expect(page.getByRole('button', { name: 'Marcar con GPS' })).toBeVisible()
  })

  test('se puede cerrar y no vuelve a molestar', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await crearPozoSinUbicar(page, `Pozo a callar ${marca}`)

    await page.goto('/mapa')
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })

    const chapa = page.getByRole('button', { name: /sin ubicar/ })
    await expect(chapa).toBeVisible()

    await page.getByRole('button', { name: 'No mostrar más este aviso' }).click()
    await expect(chapa).toHaveCount(0)

    // Y sigue callado al volver: un aviso que reaparece en cada visita es
    // exactamente lo que hacía que estorbara.
    await page.goto('/fincas')
    await page.goto('/mapa')
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
    await expect(chapa).toHaveCount(0)
  })

  test('no estorba mientras se dibuja', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await crearPozoSinUbicar(page, `Pozo que no estorba ${marca}`)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })

    // Se busca por atributo y no por rol: con la ficha abierta, vaul marca el
    // resto de la página con aria-hidden y el rol dejaría de encontrarla —el
    // test pasaría por el motivo equivocado.
    const aviso = page.locator('[data-sin-ubicar="true"]')
    await expect(aviso).toHaveCount(1)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // Las herramientas están más abajo en la ficha: hay que subirla.
    const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
    await page.mouse.move(agarre.x + agarre.width / 2, agarre.y + agarre.height / 2)
    await page.mouse.down()
    await page.mouse.move(agarre.x + agarre.width / 2, agarre.y - 400, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(900)

    const barra = page.locator('[data-dibujando="true"]')
    await elegir(page.locator('[data-herramienta="true"]').filter({ hasText: /Perímetro/ }), () =>
      expect(barra).toBeVisible({ timeout: 2000 }),
    )

    // Tapaba los tres botones de la barra de dibujo, que están abajo.
    await expect(aviso).toHaveCount(0)
  })
})

test.describe('archivar una finca se lleva sus dibujos', () => {
  test('la finca archivada y todo lo suyo desaparecen del mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`),
    ).toBeVisible()

    // Archivar es un borrado suave, no una desactivación: lo que se archiva
    // sale del mapa entero, con sus pozos y sus dibujos. Si alguna vez hace
    // falta una finca «apagada pero visible», es otra cosa y va aparte.
    archivarFincaPropia(marca)

    await page.goto('/mapa')
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`)).toHaveCount(0)
    await expect(page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)).toHaveCount(0)

    const html = await page.content()
    expect(html, 'ni sus dibujos pueden seguir viajando').not.toContain(datos.fincaPropiaId)
  })
})
