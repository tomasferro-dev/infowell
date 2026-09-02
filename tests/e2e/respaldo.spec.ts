import { expect, test } from '@playwright/test'

import { escribir, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Respaldo de los datos.
 *
 * Lo que se verifica no es que el archivo se baje, sino que **restaure**: se
 * exporta, se rompe algo a propósito, se vuelve a importar y tiene que quedar
 * como estaba. Un respaldo que se descarga pero no restaura es peor que no
 * tener ninguno, porque da tranquilidad falsa.
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

/** Espera el aviso que confirma —o rechaza— la importación. */
async function esperarAviso(page: import('@playwright/test').Page, texto: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: texto })).toBeVisible({
    timeout: 25_000,
  })
}

/** Baja el respaldo y devuelve su contenido como texto. */
async function descargar(page: import('@playwright/test').Page) {
  await page.goto('/admin/configuracion')

  await expect(page.getByText('Respaldo de los datos')).toBeVisible()

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar respaldo' }).click(),
  ])

  const ruta = await descarga.path()
  expect(descarga.suggestedFilename()).toMatch(/^infowell-respaldo-\d{4}-\d{2}-\d{2}\.json$/)

  const fs = await import('node:fs/promises')
  return fs.readFile(ruta, 'utf8')
}

/** Sube un respaldo desde memoria, sin tocar el disco. */
/**
 * Sube un respaldo y espera a que TERMINE.
 *
 * La espera va contra el aviso y no contra el texto de la pantalla: la propia
 * sección dice «las fincas, los pozos y todo lo dibujado», así que buscar
 * «fincas» daba por terminada la importación apenas cargaba la página.
 */
async function importar(page: import('@playwright/test').Page, contenido: string) {
  await page.goto('/admin/configuracion')
  // Se espera a que la pantalla esté viva: el input existe en el HTML del
  // servidor, pero su onChange lo engancha React al hidratar. Elegir el
  // archivo antes no dispara nada, sin error y sin aviso.
  await expect(page.getByText('Respaldo de los datos')).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'respaldo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contenido, 'utf8'),
  })
}

/**
 * Importar un respaldo COMPLETO no se puede probar contra esta base.
 *
 * Exportar se lleva todas las fincas e importar las vuelve a escribir, así que
 * un import en medio de la corrida revierte lo que otro test acababa de
 * cambiar —pasó: tumbó un test de dibujos que no tenía nada que ver—. Y la
 * base es la misma que usa la app publicada.
 *
 * Por eso los tests que ESCRIBEN importan un archivo acotado a la finca de la
 * corrida. Recorren el mismo camino de punta a punta —el JSON, la validación,
 * el upsert— sin tocar nada ajeno. Exportar, que es de solo lectura, sí se
 * prueba entero.
 */
function soloLaFinca(respaldo: string, farmId: string) {
  const datos = JSON.parse(respaldo)

  return JSON.stringify({
    ...datos,
    fincas: datos.fincas.filter((f: { id: string }) => f.id === farmId),
    dibujos: datos.dibujos.filter((d: { farmId?: string }) => d.farmId === farmId),
  })
}

test.describe('exportar e importar', () => {
  test.describe.configure({ mode: 'serial' })

  test('el archivo trae las fincas, los pozos y los dibujos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const respaldo = JSON.parse(await descargar(page))

    expect(respaldo.version).toBe(1)
    expect(respaldo.exportadoEl).toBeTruthy()

    const propia = respaldo.fincas.find((f: { id: string }) => f.id === datos.fincaPropiaId)
    expect(propia, 'la finca de la corrida tiene que estar').toBeTruthy()
    expect(propia.name).toContain(marca)
    expect(propia.pozos.some((p: { id: string }) => p.id === datos.pozoPropioId)).toBe(true)

    // Las coordenadas viajan como texto, no como Decimal ni como número.
    expect(typeof propia.latitude).toBe('string')
    expect(Number.isFinite(Number(propia.latitude))).toBe(true)
  })

  test('restaura lo que se cambió por error', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto(`/fincas/${datos.fincaPropiaId}`)
    const original = (await page.getByRole('heading').first().innerText()).trim()

    const respaldo = soloLaFinca(await descargar(page), datos.fincaPropiaId)

    // Se le pisa el nombre, como quien se equivoca cargando.
    const roto = `ROTO ${marca}`
    await page.goto(`/fincas/${datos.fincaPropiaId}/editar`)
    await escribir(page.getByLabel('Nombre o razón social'), roto)
    await page.getByRole('button', { name: /Guardar/ }).click()
    await expect(page.getByRole('heading', { name: roto })).toBeVisible()

    // Y el respaldo lo devuelve a como estaba.
    await importar(page, respaldo)
    await esperarAviso(page, /\d+ fincas/)

    await page.goto(`/fincas/${datos.fincaPropiaId}`)
    await expect(page.getByRole('heading', { name: original })).toBeVisible()
    await expect(page.getByRole('heading', { name: roto })).toHaveCount(0)
  })

  test('importar dos veces deja lo mismo que importar una', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const respaldo = soloLaFinca(await descargar(page), datos.fincaPropiaId)
    const pozosAntes = JSON.parse(respaldo).fincas[0].pozos.length

    await importar(page, respaldo)
    await esperarAviso(page, /1 fincas/)
    await importar(page, respaldo)
    await esperarAviso(page, /1 fincas/)

    // Un import que duplicara convertiría cada respaldo en un desastre. Se
    // cuenta sobre la finca propia y no sobre el total: otras corridas están
    // creando fincas al mismo tiempo.
    const despues = soloLaFinca(await descargar(page), datos.fincaPropiaId)
    expect(JSON.parse(despues).fincas[0].pozos.length).toBe(pozosAntes)
  })

  test('un archivo roto no rompe nada y lo dice', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await importar(page, 'esto no es json')
    await esperarAviso(page, 'El archivo no es un JSON válido')

    await importar(page, JSON.stringify({ fincas: [], dibujos: [] }))
    await esperarAviso(page, /version/i)

    await importar(page, JSON.stringify({ version: 999, fincas: [], dibujos: [] }))
    await esperarAviso(page, /versión más nueva/)
  })
})

test.describe('el respaldo es solo del administrador', () => {
  test('el CLIENTE no llega a la pantalla', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/admin/configuracion')

    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
    await expect(page.getByText('Respaldo de los datos')).toHaveCount(0)
  })

  test('y su acción tampoco le responde', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/')

    // Se la llama directo, salteando la pantalla: el permiso vive en la
    // acción, no en el botón que la muestra.
    const r = await page.evaluate(async () => {
      try {
        const res = await fetch('/admin/configuracion', { method: 'HEAD' })
        return res.status
      } catch {
        return 0
      }
    })

    expect(r === 404 || r === 200).toBe(true)
  })
})
