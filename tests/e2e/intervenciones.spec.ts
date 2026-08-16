import { expect, test } from '@playwright/test'

import { limpiarCatalogo, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * El flujo central del producto: cargar una intervención con los tres módulos
 * en un solo submit y verla reflejada en el historial del pozo.
 *
 * Cada test es autónomo: el pozo viene armado del fixture, así ninguno depende
 * de que otro haya corrido antes.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

let datos: DatosTest
let urlPozo: string
let urlNueva: string

test.beforeAll(() => {
  datos = montarDatos(marca)
  urlPozo = `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}`
  urlNueva = `${urlPozo}/intervencion/nueva`
})

test.afterAll(() => {
  limpiarDatos(marca)
  limpiarCatalogo(marca)
})

test.describe('carga de intervención', () => {
  test('guarda servicios, mediciones y observación en un solo submit', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // MÓDULO A — tres servicios marcados en las cards.
    await page.getByRole('button', { name: 'Perforación de pozo' }).click()
    await page.getByRole('button', { name: 'Limpieza de perforación' }).click()
    await page.getByRole('button', { name: 'Bobinado' }).click()

    // MÓDULO B — solo dos mediciones: el resto queda vacío a propósito.
    await page.getByLabel('Profundidad (m)').fill('42,5')
    await page.getByLabel('Caudal (m³/h)').fill('12')

    // MÓDULO C — observación.
    await page
      .getByLabel('Notas de la visita')
      .fill('Se limpió el filtro. Revisar tablero en la próxima visita.')

    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    // Vuelve al pozo y el historial ya lo refleja.
    await expect(page).toHaveURL(urlPozo)
    await expect(page.getByText('Perforación de pozo')).toBeVisible()
    await expect(page.getByText('Bobinado')).toBeVisible()
    await expect(page.getByText('42.5')).toBeVisible()
    await expect(page.getByText(/Se limpió el filtro/)).toBeVisible()

    // Y la última medición queda disponible en la pestaña Estado.
    await page.getByRole('tab', { name: 'Estado' }).click()
    // exact: el pie del perfil del pozo también menciona la última medición.
    await expect(page.getByText('Última medición', { exact: true })).toBeVisible()
  })

  test('rechaza un submit completamente vacío', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // Sin marcar nada ni escribir nada: no debe crear una visita fantasma.
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(
      page.getByText(/Marcá al menos un servicio, cargá una medición o escribí una observación/),
    ).toBeVisible()
  })

  test('rechaza el nivel dinámico más somero que el estático', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // Cargados al revés: es el error típico al completar rápido en el campo.
    await page.getByLabel('Nivel estático (m)').fill('30')
    await page.getByLabel('Nivel dinámico (m)').fill('18')
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(page.getByText(/Están cruzados/)).toBeVisible()
  })

  test('rechaza una fecha futura', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel('Fecha del trabajo').fill(manana)
    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(page.getByText('La fecha no puede ser futura')).toBeVisible()
  })

  test('registra una electrobomba al vuelo sin perder lo ya cargado', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    const modelo = `Bomba ${marca}`

    // Se carga algo ANTES de abrir el combobox, para comprobar que el alta al
    // vuelo no recarga el formulario ni borra lo escrito.
    await page.getByLabel('Profundidad (m)').fill('55')

    await page.getByRole('combobox', { name: 'Electrobomba instalada' }).click()
    await page.getByPlaceholder('Buscar o registrar una electrobomba…').fill(modelo)
    await page.getByRole('option', { name: `Registrar «${modelo}»` }).click()

    await expect(page.getByRole('combobox', { name: 'Electrobomba instalada' })).toContainText(
      modelo,
    )
    await expect(page.getByLabel('Profundidad (m)')).toHaveValue('55')
  })
})

test.describe('permisos sobre el historial', () => {
  test('el cliente ve el pozo pero no puede cargar intervenciones', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlPozo)

    await expect(page.getByRole('heading', { name: `Pozo ${marca}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nueva intervención' })).toHaveCount(0)

    const respuesta = await page.goto(urlNueva)
    expect(respuesta?.status()).toBe(404)
  })

  test('el cargador tampoco puede cargar intervenciones', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const respuesta = await page.goto(urlNueva)
    expect(respuesta?.status()).toBe(404)
  })
})
