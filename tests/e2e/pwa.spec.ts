import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * PWA: manifiesto, íconos, service worker e indicador de conexión.
 *
 * Lo más importante que se prueba acá NO es que la app se instale, sino que el
 * service worker NO guarde en el disco del teléfono ninguna página con datos
 * de una finca. En un celular compartido eso sería una fuga.
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
 * Espera a que el service worker esté controlando la página.
 *
 * Se mira `controller` y no `ready`: `ready` resuelve cuando hay un registro
 * activo, pero el SW recién intercepta pedidos cuando además toma el control
 * (que es lo que hace clients.claim()).
 */
async function esperarServiceWorker(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 15_000,
  })
}

test.describe('instalabilidad', () => {
  test('el manifiesto se sirve sin sesión y declara lo necesario', async ({ page }) => {
    // Sin login: el navegador lo pide antes de que el usuario entre.
    const respuesta = await page.request.get('/manifest.webmanifest')
    expect(respuesta.status()).toBe(200)

    const manifiesto = await respuesta.json()
    expect(manifiesto.name).toBe('Gestión de pozos')
    expect(manifiesto.display).toBe('standalone')
    expect(manifiesto.start_url).toBe('/')

    // Android exige un ícono maskable para no dibujar la app en una cápsula.
    const maskable = manifiesto.icons.find((i: { purpose: string }) => i.purpose === 'maskable')
    expect(maskable).toBeTruthy()
    expect(maskable.sizes).toBe('512x512')
  })

  test('todos los íconos declarados existen de verdad', async ({ page }) => {
    const manifiesto = await (await page.request.get('/manifest.webmanifest')).json()

    for (const icono of manifiesto.icons) {
      const r = await page.request.get(icono.src)
      expect(r.status(), icono.src).toBe(200)
      expect(r.headers()['content-type'], icono.src).toContain('image/png')
    }

    // iOS ignora el manifiesto y usa este.
    const apple = await page.request.get('/icons/apple-touch-icon.png')
    expect(apple.status()).toBe(200)
  })

  test('el service worker se descarga sin sesión', async ({ page }) => {
    // Si el middleware lo redirigiera al login, no se registraría nunca.
    const respuesta = await page.request.get('/sw.js', { maxRedirects: 0 })

    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toContain('javascript')
  })

  test('la página offline es accesible sin sesión', async ({ page }) => {
    // Es la que se muestra justamente cuando no se puede validar la sesión.
    const respuesta = await page.goto('/offline')

    expect(respuesta?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible()
  })

  test('el head declara el manifiesto y el color de tema', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#383a3c')
  })
})

test.describe('el service worker no guarda datos de nadie', () => {
  test('registra el service worker al abrir la app', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await esperarServiceWorker(page)

    const controlando = await page.evaluate(() => navigator.serviceWorker.controller !== null)
    expect(controlando).toBe(true)
  })

  test('NO cachea el HTML de una página con datos de la finca', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const urlFinca = `/fincas/${datos.fincaPropiaId}`
    await page.goto(urlFinca)
    await esperarServiceWorker(page)
    // Se vuelve a visitar para darle al SW toda oportunidad de guardarla.
    await page.goto(urlFinca)

    const cacheada = await page.evaluate(async (url) => {
      const nombres = await caches.keys()
      for (const nombre of nombres) {
        const cache = await caches.open(nombre)
        const match = await cache.match(url)
        if (match) return true
      }
      return false
    }, urlFinca)

    expect(cacheada, 'el HTML de la finca no debe quedar en el disco').toBe(false)
  })

  test('NO cachea las respuestas de /api', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await esperarServiceWorker(page)

    const hayApi = await page.evaluate(async () => {
      const nombres = await caches.keys()
      for (const nombre of nombres) {
        const cache = await caches.open(nombre)
        const claves = await cache.keys()
        if (claves.some((k) => new URL(k.url).pathname.startsWith('/api/'))) return true
      }
      return false
    })

    expect(hayApi, 'ninguna respuesta de /api debe quedar cacheada').toBe(false)
  })
})

test.describe('indicador de conexión', () => {
  test('avisa cuando se cae la señal y cuando vuelve', async ({ page, context }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    // Sin cortar nada, no debería haber ningún aviso.
    await expect(page.getByRole('status')).toHaveCount(0)

    await context.setOffline(true)
    await expect(page.getByText(/Sin conexión/)).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByText('Conexión restablecida')).toBeVisible()

    // Y el aviso de vuelta desaparece solo.
    await expect(page.getByText('Conexión restablecida')).toHaveCount(0, { timeout: 10_000 })
  })
})
