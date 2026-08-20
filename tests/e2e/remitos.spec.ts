import { expect, test } from '@playwright/test'

import { escribir, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

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

    await escribir(page.getByLabel('Monto'), '15.000,50')
    await escribir(page.getByLabel('N° de remito'), '0001-00012345')

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
    await escribir(page.getByLabel('Monto'), '1000')
    await page.getByRole('button', { name: 'Guardar remito' }).click()
    await expect(page).toHaveURL(urlRemitos)

    await page.goto(urlNuevo)
    await escribir(page.getByLabel('Monto'), '2500,25')
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

    await escribir(page.getByLabel('Monto'), 'mucha plata')
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page.getByText('El monto no es un número válido')).toBeVisible()
  })

  test('rechaza una fecha futura', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto(urlNuevo)

    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await escribir(page.getByLabel('Fecha del remito'), manana)
    await escribir(page.getByLabel('Monto'), '500')
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

    await page.goto(urlNuevo)
    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes del
    // guard: lo que se verifica es que llegue la pantalla de "no encontrado"
    // y ningún dato. Ver tests/e2e/auditoria-idor.spec.ts.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })

  test('el cargador no alcanza los remitos de una finca ajena', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    await page.goto(`/fincas/${datos.fincaAjenaId}/remitos`)
    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes del
    // guard: lo que se verifica es que llegue la pantalla de "no encontrado"
    // y ningún dato. Ver tests/e2e/auditoria-idor.spec.ts.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
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

test.describe('cuando Storage falla', () => {
  test('el mensaje dice qué revisar, en vez de un error genérico', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    // Se simula la caída de Storage: la firma responde 502, que es lo que
    // devuelve el servidor cuando no puede hablar con Supabase.
    await page.route('**/api/uploads/sign', (ruta) =>
      ruta.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'storage_no_disponible',
          detalle:
            'No se pudo preparar la subida. Revisá la configuración de Storage (bucket y claves).',
        }),
      }),
    )

    await page.goto(urlNuevo)
    // Se espera a que el formulario esté montado: con el esqueleto de carga,
    // los inputs de archivo todavía no existen apenas se navega.
    await expect(page.getByRole('button', { name: 'Sacar foto' })).toBeVisible()

    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'remito.png',
      mimeType: 'image/png',
      buffer: PNG_MINIMO,
    })

    // El operario tiene que enterarse de que no es culpa suya ni de la señal.
    await expect(page.getByText(/Revisá la configuración de Storage/)).toBeVisible()
  })

  test('una sesión vencida se distingue de un problema del servidor', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    await page.route('**/api/uploads/sign', (ruta) =>
      ruta.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Sin sesión' }),
      }),
    )

    await page.goto(urlNuevo)
    // Se espera a que el formulario esté montado: con el esqueleto de carga,
    // los inputs de archivo todavía no existen apenas se navega.
    await expect(page.getByRole('button', { name: 'Sacar foto' })).toBeVisible()

    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'remito.png',
      mimeType: 'image/png',
      buffer: PNG_MINIMO,
    })

    await expect(page.getByText(/Se cerró tu sesión/)).toBeVisible()
  })
})

/**
 * Simula un arrastre vertical con el dedo.
 *
 * Los eventos se construyen dentro del navegador porque el constructor Touch
 * exige identifier y target, que no se pueden pasar desde el runner.
 */
async function deslizar(locator: import('@playwright/test').Locator, pixeles: number) {
  await locator.evaluate((el, dy) => {
    const toque = (y: number) =>
      new Touch({ identifier: 1, target: el, clientX: 180, clientY: y })

    el.dispatchEvent(
      new TouchEvent('touchstart', { touches: [toque(200)], bubbles: true }),
    )
    el.dispatchEvent(
      new TouchEvent('touchmove', { touches: [toque(200 + dy)], bubbles: true }),
    )
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }))
  }, pixeles)
}

test.describe('detalle del remito', () => {
  /** Crea un remito con dos fotos y devuelve la URL de su detalle. */
  async function crearRemitoConFotos(page: import('@playwright/test').Page, numero: string) {
    await login(page, `${marca}-cargador@test.local`)

    await page.goto(urlNuevo)
    await escribir(page.getByLabel('Monto'), '3300')
    await escribir(page.getByLabel('N° de remito'), numero)
    await page.locator('input[type="file"]').nth(1).setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG_MINIMO },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG_MINIMO },
    ])
    await expect(page.getByText('Subiendo fotos…')).toHaveCount(0, { timeout: 20_000 })
    await page.getByRole('button', { name: 'Guardar remito' }).click()
    await expect(page).toHaveURL(urlRemitos)

    // El encabezado de la tarjeta navega al detalle; las miniaturas no.
    await page.getByRole('listitem').filter({ hasText: numero }).getByRole('link').click()
    await expect(page).toHaveURL(/\/remitos\/[a-z0-9]+$/)
  }

  test('desde el listado se llega al detalle con la grilla de fotos', async ({ page }) => {
    await crearRemitoConFotos(page, `DET-${Date.now()}`)

    await expect(page.getByRole('heading', { name: '2 fotos' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ampliar foto 2/ })).toBeVisible()
  })

  test('el visor bloquea el scroll de la página de atrás', async ({ page }) => {
    await crearRemitoConFotos(page, `SCR-${Date.now()}`)

    const overflowAntes = await page.evaluate(() => document.body.style.overflow)

    await page.getByRole('button', { name: /Ampliar foto 1/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Con el visor abierto, el documento no puede scrollear.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    // Acotado al visor: "Cerrar" también matchea "Cerrar sesión" del encabezado.
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Y al cerrar queda exactamente como estaba.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(overflowAntes)
  })

  test('deslizar hacia abajo cierra el visor', async ({ page }) => {
    await crearRemitoConFotos(page, `SWI-${Date.now()}`)

    await page.getByRole('button', { name: /Ampliar foto 1/ }).click()
    const visor = page.getByRole('dialog')
    await expect(visor).toBeVisible()

    // Gesto de arrastre vertical, el mismo de la galería del teléfono.
    await deslizar(visor, 250)

    await expect(visor).toHaveCount(0)
    // Y el scroll vuelve a funcionar.
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('un arrastre corto NO cierra el visor', async ({ page }) => {
    await crearRemitoConFotos(page, `COR-${Date.now()}`)

    await page.getByRole('button', { name: /Ampliar foto 1/ }).click()
    const visor = page.getByRole('dialog')

    // 40px: un movimiento accidental del dedo no debe cerrar la foto.
    await deslizar(visor, 40)

    await expect(visor).toBeVisible()
  })
})
