import { expect, test } from '@playwright/test'

/**
 * Flujo de autenticación de punta a punta contra la base real.
 *
 * Las credenciales salen del entorno (las mismas del seed): el test nunca
 * lleva una contraseña escrita en el código.
 */
const EMAIL = process.env.SEED_ADMIN_EMAIL
const PASSWORD = process.env.SEED_ADMIN_PASSWORD

test.describe('autenticación', () => {
  test('un visitante sin sesión es enviado al login y conserva su destino', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'InfoWell' })).toBeVisible()
  })

  test('una contraseña incorrecta no deja entrar y no revela si el email existe', async ({
    page,
  }) => {
    test.skip(!EMAIL, 'falta SEED_ADMIN_EMAIL en el entorno')

    await page.goto('/login')
    await page.getByLabel('Email').fill(EMAIL!)
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    // Se acota al formulario: Next monta su propio role="alert" (el anunciador
    // de rutas) fuera de él.
    const error = page.locator('form').getByRole('alert')
    await expect(error).toBeVisible()
    // Mensaje genérico a propósito: no distingue "no existe" de "clave mal".
    await expect(error).toHaveText('Email o contraseña incorrectos')
    await expect(page).toHaveURL(/\/login/)
  })

  test('un email inexistente devuelve exactamente el mismo error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('no-existe-jamas@ejemplo.com')
    await page.getByLabel('Contraseña').fill('loquesea')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.locator('form').getByRole('alert')).toHaveText(
      'Email o contraseña incorrectos',
    )
  })

  test('el admin entra y ve el dashboard con su rol', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'faltan credenciales del seed en el entorno')

    await page.goto('/login')
    await page.getByLabel('Email').fill(EMAIL!)
    await page.getByLabel('Contraseña').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
    await expect(page.getByText('Vista completa de todas las fincas.')).toBeVisible()
  })

  test('cerrar sesión devuelve al login y corta el acceso', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'faltan credenciales del seed en el entorno')

    await page.goto('/login')
    await page.getByLabel('Email').fill(EMAIL!)
    await page.getByLabel('Contraseña').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login/)

    // Y volver atrás no debe reabrir la sesión.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
