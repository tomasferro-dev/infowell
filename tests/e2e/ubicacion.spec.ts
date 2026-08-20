import { expect, test } from '@playwright/test'

import { escribir, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Captura de ubicación con GPS.
 *
 * Es el dato que hace posible el mapa, y hasta ahora no existía en ningún
 * pozo: los campos estaban en la base desde el principio pero nadie iba a
 * tipear "-33.023456" a mano.
 *
 * Playwright puede simular el GPS del dispositivo, así que el flujo completo
 * —permiso, lectura, precisión, guardado— se prueba de verdad.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

/** Un punto en Luján de Cuyo, con precisión buena. */
const UBICACION = { latitude: -33.0412, longitude: -68.8934, accuracy: 8 }

let datos: DatosTest

test.beforeAll(() => {
  datos = montarDatos(marca)
})

test.afterAll(() => {
  limpiarDatos(marca)
})

test.describe('con permiso de ubicación concedido', () => {
  test.use({ geolocation: UBICACION, permissions: ['geolocation'] })

  test('marca la ubicación de un pozo nuevo y la guarda', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)

    const nombre = `Pozo GPS ${marca}`
    await escribir(page.getByLabel('Nombre del pozo'), nombre)

    await page.getByRole('button', { name: 'Marcar con GPS' }).click()

    // Muestra las coordenadas y la precisión, no solo un "listo".
    await expect(page.getByText('-33.041200, -68.893400')).toBeVisible()
    await expect(page.getByText(/Precisión ±8 m/)).toBeVisible()

    await page.getByRole('button', { name: 'Crear pozo' }).click()
    await expect(page).toHaveURL(`/fincas/${datos.fincaPropiaId}`)

    // Y quedó guardada: se ve al volver a abrir el pozo.
    await page.getByText(nombre).click()
    await expect(page.getByText('-33.0412')).toBeVisible()
  })

  test('la ubicación se puede quitar antes de guardar', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)

    await page.getByRole('button', { name: 'Marcar con GPS' }).click()
    await expect(page.getByText(/Precisión ±8 m/)).toBeVisible()

    await page.getByRole('button', { name: 'Quitar ubicación' }).click()

    // Vuelve al estado inicial, sin coordenadas colgadas.
    await expect(page.getByRole('button', { name: 'Marcar con GPS' })).toBeVisible()
    await expect(page.getByText(/Precisión/)).toHaveCount(0)
  })

  test('la finca también se puede ubicar', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/fincas/nueva')

    const nombre = `Finca GPS ${marca}`
    await escribir(page.getByLabel('Nombre o razón social'), nombre)
    await page.getByRole('button', { name: 'Marcar con GPS' }).click()
    await expect(page.getByText('-33.041200, -68.893400')).toBeVisible()

    await page.getByRole('button', { name: 'Crear finca' }).click()
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  })

  test('al editar un pozo llega la ubicación que ya tenía', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    // Se crea con ubicación…
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)
    const nombre = `Pozo Reabrir ${marca}`
    await escribir(page.getByLabel('Nombre del pozo'), nombre)
    await page.getByRole('button', { name: 'Marcar con GPS' }).click()
    await expect(page.getByText(/Precisión ±8 m/)).toBeVisible()
    await page.getByRole('button', { name: 'Crear pozo' }).click()
    await expect(page).toHaveURL(`/fincas/${datos.fincaPropiaId}`)

    // …y al volver a editarlo, la ubicación sigue ahí.
    // Se confirma cada pantalla antes de seguir: sin eso el click en «Editar»
    // llega mientras todavía se ve la finca, y ahí «Editar» es el de la finca.
    await page.getByText(nombre).click()
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()

    await page.getByRole('link', { name: 'Editar' }).click()
    await expect(page.getByRole('heading', { name: 'Editar pozo' })).toBeVisible()

    await expect(page.getByText('-33.041200, -68.893400')).toBeVisible()
    await expect(page.getByText('Cargada anteriormente')).toBeVisible()
  })
})

test.describe('sin permiso de ubicación', () => {
  test('explica qué pasó y ofrece cargarla a mano', async ({ page, context }) => {
    await context.clearPermissions()

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)

    await page.getByRole('button', { name: 'Marcar con GPS' }).click()

    // El mensaje dice qué hacer, no solo que falló.
    await expect(page.getByText(/No diste permiso de ubicación/)).toBeVisible()

    // Y la salida manual sigue disponible: se puede cargar desde la oficina.
    await page.getByRole('button', { name: 'Cargar coordenadas a mano' }).click()
    await expect(page.getByLabel('Latitud')).toBeVisible()
    await expect(page.getByLabel('Longitud')).toBeVisible()
  })

  test('las coordenadas cargadas a mano se guardan igual', async ({ page, context }) => {
    await context.clearPermissions()

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)

    const nombre = `Pozo Manual ${marca}`
    await escribir(page.getByLabel('Nombre del pozo'), nombre)

    await page.getByRole('button', { name: 'Cargar coordenadas a mano' }).click()
    await escribir(page.getByLabel('Latitud'), '-33.5')
    await escribir(page.getByLabel('Longitud'), '-68.5')

    await page.getByRole('button', { name: 'Crear pozo' }).click()
    await expect(page).toHaveURL(`/fincas/${datos.fincaPropiaId}`)

    await page.getByText(nombre).click()
    await expect(page.getByText('-33.5')).toBeVisible()
  })
})
