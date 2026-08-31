import { expect, test } from '@playwright/test'

import { escribir, limpiarCatalogo, login, marca } from './helpers'

/**
 * Catálogos extensibles. Lo crítico acá no es el alta sino la deduplicación:
 * si "Bobinado" y "bobinado" pueden convivir, el catálogo se degrada solo.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

// Los catálogos son globales: lo que creen estos tests quedaría a la vista del
// cliente si no se limpia al terminar.
test.afterAll(() => {
  limpiarCatalogo(marca)
})

test.describe('catálogo de servicios', () => {
  test('muestra los 13 servicios base marcados como no borrables', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/servicios')

    await expect(page.getByText('Perforación de pozo')).toBeVisible()
    await expect(page.getByText('Estudio geológico')).toBeVisible()

    // Los del seed llevan el badge "Base" y no ofrecen borrado en ningún lado.
    await expect(page.getByText('Base').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
  })

  test('avisa que ya existe en lugar de duplicar, ignorando tildes y mayúsculas', async ({
    page,
  }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/servicios')
    // Se espera a que la lista esté cargada antes de contar: si no, se
    // contarían cero (el esqueleto es decorativo y no expone sus filas).
    await expect(page.getByText('Perforación de pozo')).toBeVisible()

    const antes = await page.getByRole('listitem').count()

    // Mismo servicio del seed, escrito sin tilde y en minúsculas.
    await escribir(page.getByLabel('Nuevo servicio'), 'perforacion de pozo')
    await page.getByRole('button', { name: 'Agregar' }).click()

    await expect(page.getByText(/ya existía/)).toBeVisible()

    // Y lo importante: la lista no creció.
    await expect(page.getByRole('listitem')).toHaveCount(antes)
  })

  test('desactivar un servicio lo saca de la lista de activos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/servicios')

    const fila = page.getByRole('listitem').filter({ hasText: 'Bobinado' })
    await fila.getByRole('button', { name: 'Desactivar' }).click()

    await expect(fila.getByText('Inactivo')).toBeVisible()

    // Se restaura para no dejar el catálogo alterado para las próximas corridas.
    await fila.getByRole('button', { name: 'Activar' }).click()
    await expect(fila.getByText('Inactivo')).toHaveCount(0)
  })
})

test.describe('catálogo de electrobombas', () => {
  test('crea una electrobomba y la reconoce como existente al repetirla', async ({ page }) => {
    // Lleva la marca de la corrida para que el afterAll pueda limpiarlo.
    const modelo = `Grundfos ${marca}`

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/bombas')

    await escribir(page.getByLabel('Nuevo electrobomba'), modelo)
    await page.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText(`«${modelo}» agregado.`)).toBeVisible()

    // Mismo modelo con otra puntuación y espaciado: debe reconocerlo.
    await escribir(page.getByLabel('Nuevo electrobomba'), `  ${modelo.toUpperCase()}.  `)
    await page.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText(/ya existía/)).toBeVisible()
  })

  test('se navega entre los dos catálogos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/servicios')

    await page.getByRole('link', { name: 'Electrobombas' }).click()
    await expect(page.getByRole('heading', { name: 'Electrobombas' })).toBeVisible()

    await page.getByRole('link', { name: 'Servicios' }).click()
    await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible()
  })
})

test.describe('la barra de administración entra en el teléfono', () => {
  /**
   * Con «Configuración» como tercera pestaña, el texto no entraba en una
   * pantalla de teléfono: se salía del recuadro y dejaba TODO el sitio
   * deslizable hacia la derecha, con contenido escondido fuera de la vista.
   * Un desborde horizontal no avisa —no hay error, no hay nada roto a la
   * vista—, así que se mide.
   */
  test('ninguna pantalla de admin se desborda a lo ancho', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    for (const ancho of [320, 360, 412]) {
      await page.setViewportSize({ width: ancho, height: 780 })

      for (const ruta of ['/admin/servicios', '/admin/bombas', '/admin/configuracion']) {
        await page.goto(ruta)
        await expect(page.getByRole('link', { name: 'Configuración' })).toBeVisible()

        const sobra = await page.evaluate(
          () => document.body.scrollWidth - document.documentElement.clientWidth,
        )
        expect(sobra, `${ruta} a ${ancho}px se desborda ${sobra}px`).toBeLessThanOrEqual(0)
      }
    }
  })

  test('la configuración es un ícono con nombre, fuera del recuadro', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/servicios')

    // Es un ícono, así que el nombre accesible es lo único que lo anuncia:
    // sin él un lector de pantalla diría «enlace» y nada más.
    const engranaje = page.getByRole('link', { name: 'Configuración' })
    await expect(engranaje).toBeVisible()
    await expect(engranaje).toHaveText('')

    // Y está afuera del recuadro que agrupa a los dos catálogos.
    const adentro = await engranaje.evaluate((el) => Boolean(el.closest('nav')))
    expect(adentro, 'el engranaje no va adentro del recuadro de catálogos').toBe(false)

    await engranaje.click()
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
    await expect(engranaje).toHaveAttribute('aria-current', 'page')
  })
})
