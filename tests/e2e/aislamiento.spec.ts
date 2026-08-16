import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * EL test del proyecto: que un cliente no pueda ver, por ningún camino, datos
 * de una finca que no es suya.
 *
 * Escenario: dos fincas (PROPIA y AJENA) y un cliente asignado solo a PROPIA.
 */

const NOMBRE_PROPIA = `${marca} Finca Propia`
const NOMBRE_AJENA = `${marca} Finca Ajena`
const EMAIL_CLIENTE = `${marca}-cliente@test.local`
const EMAIL_CARGADOR = `${marca}-cargador@test.local`

let datos: DatosTest
let fincaPropiaId: string
let fincaAjenaId: string

test.beforeAll(() => {
  datos = montarDatos(marca)
  fincaPropiaId = datos.fincaPropiaId
  fincaAjenaId = datos.fincaAjenaId
})

test.afterAll(() => {
  limpiarDatos(marca)
})

test.describe('aislamiento entre fincas', () => {
  test('el cliente ve su finca en el listado y NO ve la ajena', async ({ page }) => {
    await login(page, EMAIL_CLIENTE)
    await page.goto('/fincas')

    await expect(page.getByText(NOMBRE_PROPIA)).toBeVisible()
    await expect(page.getByText(NOMBRE_AJENA)).toHaveCount(0)
  })

  test('el cliente que entra por URL a una finca ajena no ve nada de ella', async ({ page }) => {
    await login(page, EMAIL_CLIENTE)

    await page.goto(`/fincas/${fincaAjenaId}`)

    // La misma pantalla que para algo inexistente: así no puede deducir que
    // esa finca existe. Ver el detalle del compromiso en auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
    await expect(page.getByText(NOMBRE_AJENA)).toHaveCount(0)
  })

  test('el cliente tampoco alcanza un pozo de una finca ajena por URL', async ({ page }) => {
    await login(page, EMAIL_CLIENTE)

    await page.goto(`/fincas/${fincaAjenaId}/pozos/${datos.pozoAjenoId}`)

    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes
    // del guard: se verifica la pantalla, no el número. Ver auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
    await expect(page.getByText('Pozo secreto')).toHaveCount(0)
  })

  test('el cliente no puede abrir el formulario de edición de su propia finca', async ({
    page,
  }) => {
    await login(page, EMAIL_CLIENTE)

    // Es de solo lectura: ni siquiera sobre lo suyo puede escribir.
    await page.goto(`/fincas/${fincaPropiaId}/editar`)

    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes
    // del guard: se verifica la pantalla, no el número. Ver auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })

  test('el cliente no ve botones de escritura en su propia finca', async ({ page }) => {
    await login(page, EMAIL_CLIENTE)
    await page.goto(`/fincas/${fincaPropiaId}`)

    await expect(page.getByRole('heading', { name: NOMBRE_PROPIA })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Agregar' })).toHaveCount(0)
  })

  test('el cliente no accede a la gestión de usuarios', async ({ page }) => {
    await login(page, EMAIL_CLIENTE)

    await page.goto('/admin/usuarios')

    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes
    // del guard: se verifica la pantalla, no el número. Ver auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })

  test('el cargador ve su finca pero no puede crear pozos', async ({ page }) => {
    await login(page, EMAIL_CARGADOR)
    await page.goto(`/fincas/${fincaPropiaId}`)

    await expect(page.getByRole('heading', { name: NOMBRE_PROPIA })).toBeVisible()
    // Su permiso de escritura es solo para remitos.
    await expect(page.getByRole('link', { name: 'Agregar' })).toHaveCount(0)

    await page.goto(`/fincas/${fincaPropiaId}/pozos/nuevo`)

    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes
    // del guard: se verifica la pantalla, no el número. Ver auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })

  test('el cargador no ve la finca ajena', async ({ page }) => {
    await login(page, EMAIL_CARGADOR)

    await page.goto(`/fincas/${fincaAjenaId}`)

    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes
    // del guard: se verifica la pantalla, no el número. Ver auditoria-idor.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })
})

test.describe('CRUD del admin', () => {
  const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
  const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

  test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

  test('el admin ve todas las fincas, incluidas las que no tiene asignadas', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/fincas')

    await expect(page.getByText(NOMBRE_PROPIA)).toBeVisible()
    await expect(page.getByText(NOMBRE_AJENA)).toBeVisible()
  })

  test('el admin crea una finca y un pozo desde la interfaz', async ({ page }) => {
    const nombreFinca = `${marca} Finca Creada UI`

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto('/fincas/nueva')
    await page.getByLabel('Nombre o razón social').fill(nombreFinca)
    await page.getByLabel('Localidad').fill('San Rafael')
    await page.getByRole('button', { name: 'Crear finca' }).click()

    await expect(page.getByRole('heading', { name: nombreFinca })).toBeVisible()

    await page.getByRole('link', { name: 'Agregar' }).click()
    await page.getByLabel('Nombre del pozo').fill('Pozo N° 1 - Sector Norte')
    await page.getByRole('button', { name: 'Crear pozo' }).click()

    await expect(page.getByText('Pozo N° 1 - Sector Norte')).toBeVisible()
  })

  test('rechaza un CUIT con dígito verificador incorrecto', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto('/fincas/nueva')
    await page.getByLabel('Nombre o razón social').fill(`${marca} Finca CUIT malo`)
    await page.getByLabel('CUIT').fill('30-71234567-9')
    await page.getByRole('button', { name: 'Crear finca' }).click()

    await expect(page.getByText('El CUIT no es válido')).toBeVisible()
  })

  test('no deja crear dos pozos con el mismo nombre en la misma finca', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto(`/fincas/${fincaPropiaId}/pozos/nuevo`)
    await page.getByLabel('Nombre del pozo').fill('Pozo Duplicado')
    await page.getByRole('button', { name: 'Crear pozo' }).click()
    await expect(page.getByText('Pozo Duplicado')).toBeVisible()

    await page.goto(`/fincas/${fincaPropiaId}/pozos/nuevo`)
    await page.getByLabel('Nombre del pozo').fill('Pozo Duplicado')
    await page.getByRole('button', { name: 'Crear pozo' }).click()

    await expect(page.getByText('Ya existe un pozo con ese nombre en esta finca')).toBeVisible()
  })
})
