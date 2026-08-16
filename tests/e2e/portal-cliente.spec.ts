import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Portal del cliente.
 *
 * El inicio es la vista más peligrosa de todas: muestra datos AGREGADOS
 * (conteos, totales, últimos movimientos). Un filtro mal puesto acá no se ve
 * como una fuga — se ve como un número un poco más grande.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

const NOMBRE_AJENA = `${marca} Finca Ajena`
const NOMBRE_PROPIA = `${marca} Finca Propia`

/** Monto irrepetible: si aparece donde no debe, es una fuga y no una casualidad. */
const MONTO_AJENO = '987654,32'
const TEXTO_MONTO_AJENO = /987\.654,32/

let datos: DatosTest

test.beforeAll(() => {
  datos = montarDatos(marca)
})

test.afterAll(() => {
  limpiarDatos(marca)
})

async function cargarRemito(page: import('@playwright/test').Page, farmId: string, monto: string) {
  await page.goto(`/fincas/${farmId}/remitos/nuevo`)
  await page.getByLabel('Monto').fill(monto)
  await page.getByRole('button', { name: 'Guardar remito' }).click()
  await expect(page).toHaveURL(`/fincas/${farmId}/remitos`)
}

test.describe('el inicio del cliente solo agrega lo suyo', () => {
  test('no aparece ningún dato de la finca ajena', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await cargarRemito(page, datos.fincaPropiaId, '1000')
    await cargarRemito(page, datos.fincaAjenaId, MONTO_AJENO)

    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/')

    // Lo suyo sí lo ve.
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
    await expect(page.getByText(NOMBRE_PROPIA).first()).toBeVisible()

    // Lo ajeno no existe para él: ni el nombre de la finca ni su importe.
    await expect(page.getByText(NOMBRE_AJENA)).toHaveCount(0)
    await expect(page.getByText(TEXTO_MONTO_AJENO)).toHaveCount(0)
  })

  test('el admin sí alcanza el remito de la otra finca', async ({ page }) => {
    // Se verifica en la página de esa finca y no en el inicio: el inicio
    // muestra los últimos 5 y otros tests cargan remitos en paralelo.
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaAjenaId}/remitos`)

    await expect(page.getByText(TEXTO_MONTO_AJENO).first()).toBeVisible()
  })
})

test.describe('la vista del cliente es de solo lectura', () => {
  test('no se le muestra ninguna acción de escritura', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Cargar remito' })).toHaveCount(0)

    await page.goto('/fincas')
    await expect(page.getByRole('link', { name: 'Nueva' })).toHaveCount(0)

    await page.goto(`/fincas/${datos.fincaPropiaId}`)
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Agregar' })).toHaveCount(0)

    await page.goto(`/fincas/${datos.fincaPropiaId}/remitos`)
    await expect(page.getByRole('link', { name: 'Cargar' })).toHaveCount(0)

    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}`)
    await expect(page.getByRole('link', { name: 'Nueva intervención' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  })

  test('la barra de navegación no le ofrece administración', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Catálogos' })).toHaveCount(0)
    // Pero sí lo que le corresponde.
    await expect(page.getByRole('link', { name: 'Fincas' })).toBeVisible()
  })

  test('sí puede ver el historial técnico completo de su pozo', async ({ page }) => {
    const urlPozo = `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}`

    // Primero el admin carga una intervención con medición y observación.
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`${urlPozo}/intervencion/nueva`)
    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByLabel('Profundidad (m)').fill('38,5')
    await page.getByLabel('Notas de la visita').fill('Quedó operativa tras el bobinado.')
    await page.getByRole('button', { name: 'Guardar intervención' }).click()
    await expect(page).toHaveURL(urlPozo)

    // Y el cliente la ve entera: es su información.
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlPozo)

    // exact: si no, "Bobinado" también matchea el texto de la observación.
    await expect(page.getByText('Bobinado', { exact: true })).toBeVisible()
    await expect(page.getByText('38.5')).toBeVisible()
    await expect(page.getByText(/Quedó operativa/)).toBeVisible()

    await page.getByRole('tab', { name: 'Estado' }).click()
    // exact: el pie del perfil del pozo también menciona la última medición.
    await expect(page.getByText('Última medición', { exact: true })).toBeVisible()
  })
})

test.describe('usuario sin fincas asignadas', () => {
  test('ve un aviso claro en vez de una pantalla vacía', async ({ page }) => {
    const email = `${marca}-huerfano@test.local`

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/admin/usuarios/nuevo')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Contraseña').fill('clave-de-prueba-123')
    // El rol CLIENTE viene marcado por defecto; no se le asigna ninguna finca.
    await page.getByRole('button', { name: 'Crear usuario' }).click()
    await expect(page).toHaveURL('/admin/usuarios')

    await login(page, email)
    await expect(page.getByText('Todavía no tenés fincas asignadas')).toBeVisible()
  })
})
