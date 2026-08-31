import { expect, test } from '@playwright/test'

import {
  elegir,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  resetAjustes,
  type DatosTest,
} from './helpers'

/**
 * Ajustes globales de la app.
 *
 * Lo delicado acá es que son GLOBALES: cambiarlos se los cambia a todos los
 * usuarios a la vez. Por eso importa tanto quién puede tocarlos como que el
 * test deje el ajuste como lo encontró — esta base es la misma que usa la app
 * publicada.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')


let datos: DatosTest

test.beforeAll(() => {
  datos = montarDatos(marca)
})

test.afterAll(() => {
  // Fuera del test a propósito: corre aunque el test se caiga a la mitad.
  resetAjustes()
  limpiarDatos(marca)
})

/**
 * Estos ESCRIBEN el ajuste, que es una sola fila para toda la app: dos tests
 * tocándola a la vez se pisan y el segundo lee lo que escribió el primero.
 * Corren en serie y en un solo proyecto — el criterio de numeración no depende
 * del tamaño de la pantalla, así que correrlo en los dos no daría más
 * cobertura, solo una carrera.
 */
test.describe('numeración de los pozos', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'el ajuste es global: un solo proyecto')
  })

  test('arranca por orden de carga y el cambio queda guardado', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/configuracion')

    const porCarga = page.getByRole('radio', { name: /Por orden de carga/ })
    const porPerforacion = page.getByRole('radio', { name: /Por fecha de perforación/ })

    // Sin nada guardado, el criterio es el que nunca deja pozos sin número.
    await expect(porCarga).toHaveAttribute('aria-checked', 'true')

    await elegir(porPerforacion, () =>
      expect(porPerforacion).toHaveAttribute('aria-checked', 'true', { timeout: 1500 }),
    )

    // Se espera el aviso ANTES de recargar. La opción se marca de entrada,
    // sin esperar al servidor —si no, el toque parece no haber funcionado—,
    // así que recargar apenas se marca cancela el guardado en pleno viaje.
    await expect(page.getByText('Numeración actualizada')).toBeVisible()

    // Y sobrevive a la recarga: es lo que distingue guardar de solo pintar.
    await page.reload()
    await expect(porPerforacion).toHaveAttribute('aria-checked', 'true')
    await expect(porCarga).toHaveAttribute('aria-checked', 'false')

    // Se vuelve atrás para no dejarle el criterio cambiado a la empresa.
    await elegir(porCarga, () =>
      expect(porCarga).toHaveAttribute('aria-checked', 'true', { timeout: 1500 }),
    )
    await expect(page.getByText('Numeración actualizada')).toBeVisible()
    await page.reload()
    await expect(porCarga).toHaveAttribute('aria-checked', 'true')
  })

  test('el criterio elegido llega al mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })

    const pozo = page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)
    await expect(pozo).toHaveText('1')

    // Con el otro criterio el pozo sigue numerado: el orden puede cambiar,
    // pero ningún pozo puede quedarse sin número.
    await page.goto('/admin/configuracion')
    const porPerforacion = page.getByRole('radio', { name: /Por fecha de perforación/ })
    await elegir(porPerforacion, () =>
      expect(porPerforacion).toHaveAttribute('aria-checked', 'true', { timeout: 1500 }),
    )
    await expect(page.getByText('Numeración actualizada')).toBeVisible()

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
    await expect(pozo).toHaveText(/^\d+$/)

    await page.goto('/admin/configuracion')
    const porCarga = page.getByRole('radio', { name: /Por orden de carga/ })
    await elegir(porCarga, () =>
      expect(porCarga).toHaveAttribute('aria-checked', 'true', { timeout: 1500 }),
    )
    await expect(page.getByText('Numeración actualizada')).toBeVisible()
  })
})

test.describe('solo el administrador toca los ajustes', () => {
  test('el CLIENTE no llega a la configuración', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/admin/configuracion')

    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
    await expect(page.getByText('Numeración de los pozos')).toHaveCount(0)
  })

  test('el CARGADOR tampoco', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto('/admin/configuracion')

    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })
})
