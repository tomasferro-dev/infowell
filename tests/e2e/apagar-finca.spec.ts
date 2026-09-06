import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Apagar una finca, que NO es archivarla.
 *
 * Lo que se prueba es la diferencia: archivar la saca de todos lados, apagar
 * la deja a la vista con su historial y solo la retira de donde se empieza
 * trabajo nuevo. Si eso se confunde, alguien apaga una finca creyendo que la
 * esconde, o la archiva creyendo que solo la apaga.
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

test.describe('apagar una finca', () => {
  test.describe.configure({ mode: 'serial' })

  test('se apaga, se dice, y sigue estando', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}`)

    await page.getByRole('button', { name: 'Apagar esta finca' }).click()

    // Se ve en la ficha.
    await expect(page.getByText('Apagada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Volver a activarla' })).toBeVisible()

    // Y en el listado, que es donde se ven todas juntas.
    await page.goto('/fincas')
    const fila = page.getByRole('listitem').filter({ hasText: `${marca} Finca Propia` })
    await expect(fila).toContainText('Apagada')

    // Sigue teniendo su historial: apagar no esconde nada.
    await page.goto(`/fincas/${datos.fincaPropiaId}`)
    await expect(page.getByRole('heading', { name: new RegExp(marca) })).toBeVisible()
    await expect(page.getByText(`Pozo ${marca}`)).toBeVisible()
  })

  test('apagada no se le carga trabajo nuevo', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    // La ajena sigue activa y SÍ ofrece el botón: sin esta comparación, una
    // página rota que no muestre ningún botón daría este test por bueno.
    await page.goto(`/fincas/${datos.fincaAjenaId}`)
    await expect(page.getByRole('link', { name: 'Agregar' })).toBeVisible()

    await page.goto(`/fincas/${datos.fincaPropiaId}`)
    await expect(page.getByRole('link', { name: 'Agregar' })).toHaveCount(0)
  })

  test('al cargador apagada le saca el atajo de cargar remito', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto('/')

    // `fincasDelCargador` filtra por isActive: con su única finca apagada, el
    // botón grande del inicio no tiene adónde llevar y no aparece.
    await expect(page.getByRole('link', { name: 'Cargar remito' })).toHaveCount(0)
  })

  test('se vuelve a activar y todo queda como estaba', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}`)

    await page.getByRole('button', { name: 'Volver a activarla' }).click()

    await expect(page.getByRole('button', { name: 'Apagar esta finca' })).toBeVisible()
    await expect(page.getByText('Apagada')).toHaveCount(0)
  })

  test('el CLIENTE no puede apagar la suya: es de solo lectura', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(`/fincas/${datos.fincaPropiaId}`)

    await expect(page.getByRole('button', { name: 'Apagar esta finca' })).toHaveCount(0)
  })
})
