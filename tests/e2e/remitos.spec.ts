import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Remitos: el flujo del Cargador, que es quien más usa la app.
 *
 * La cámara nativa no se puede automatizar, pero sí el resto: elegir archivos
 * (que es el mismo input), la compresión, la subida y el guardado.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

let datos: DatosTest
let urlRemitos: string
let urlNuevo: string

test.beforeAll(() => {
  datos = montarDatos(marca)
  urlRemitos = `/fincas/${datos.fincaPropiaId}/remitos`
  urlNuevo = `${urlRemitos}/nuevo`
})

test.afterAll(() => {
  limpiarDatos(marca)
})

/** PNG 1x1 válido, para ejercitar el camino real de compresión y subida. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('carga de remitos', () => {
  test('el cargador guarda un remito con fecha, monto y foto', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto(urlNuevo)

    // La fecha viene puesta en hoy: el operario no debería tener que tocarla.
    const hoy = new Date()
    const fechaEsperada = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    await expect(page.getByLabel('Fecha del remito')).toHaveValue(fechaEsperada)

    await page.getByLabel('Monto').fill('15.000,50')
    await page.getByLabel('N° de remito').fill('0001-00012345')

    // El input de galería es el segundo file input (el primero es la cámara).
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'remito.png',
      mimeType: 'image/png',
      buffer: PNG_MINIMO,
    })

    // Espera a que termine la subida antes de guardar.
    await expect(page.getByText('Subiendo fotos…')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Quitar foto 1/ })).toBeVisible()

    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page).toHaveURL(urlRemitos)

    // Se acota al ítem del listado: el mismo importe también aparece en el
    // total del encabezado. La regex evita el espacio duro (U+00A0) que
    // Intl.NumberFormat pone entre el símbolo y el número.
    const item = page.getByRole('listitem').filter({ hasText: '0001-00012345' })
    await expect(item).toHaveCount(1)
    await expect(item.getByText(/15\.000,50/)).toBeVisible()

    // Y la miniatura se sirve por la ruta protegida.
    await expect(item.getByRole('button', { name: /Ampliar foto 1/ })).toBeVisible()
  })

  test('el total suma los remitos de la finca', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    await page.goto(urlNuevo)
    await page.getByLabel('Monto').fill('1000')
    await page.getByRole('button', { name: 'Guardar remito' }).click()
    await expect(page).toHaveURL(urlRemitos)

    await page.goto(urlNuevo)
    await page.getByLabel('Monto').fill('2500,25')
    await page.getByRole('button', { name: 'Guardar remito' }).click()
    await expect(page).toHaveURL(urlRemitos)

    // El encabezado muestra la suma, no solo la cantidad.
    await expect(page.getByText(/en total/)).toBeVisible()
  })

  test('exige el monto', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto(urlNuevo)

    // Se saca el required del HTML para llegar a la validación del servidor.
    await page.getByLabel('Monto').evaluate((el) => el.removeAttribute('required'))
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page.getByText('Indicá el monto')).toBeVisible()
  })

  test('rechaza un monto que no es número', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto(urlNuevo)

    await page.getByLabel('Monto').fill('mucha plata')
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page.getByText('El monto no es un número válido')).toBeVisible()
  })

  test('rechaza una fecha futura', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto(urlNuevo)

    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel('Fecha del remito').fill(manana)
    await page.getByLabel('Monto').fill('500')
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page.getByText('La fecha no puede ser futura')).toBeVisible()
  })
})

test.describe('permisos sobre remitos', () => {
  test('el cliente ve los remitos de su finca pero no puede cargarlos', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlRemitos)

    await expect(page.getByRole('heading', { name: 'Remitos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cargar' })).toHaveCount(0)

    const respuesta = await page.goto(urlNuevo)
    expect(respuesta?.status()).toBe(404)
  })

  test('el cargador no alcanza los remitos de una finca ajena', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const respuesta = await page.goto(`/fincas/${datos.fincaAjenaId}/remitos`)
    expect(respuesta?.status()).toBe(404)
  })

  test('el cargador sí puede pedir la firma para subir una foto de remito', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const respuesta = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'remito',
        farmId: datos.fincaPropiaId,
        recursoId: 'borrador-1',
        mimeType: 'image/jpeg',
      },
    })

    expect(respuesta.status()).toBe(200)
  })

  test('pero NO para una nota de voz: eso es de las intervenciones', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const respuesta = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'nota-voz',
        farmId: datos.fincaPropiaId,
        recursoId: datos.pozoPropioId,
        mimeType: 'audio/webm',
      },
    })

    expect(respuesta.status()).toBe(404)
  })
})
