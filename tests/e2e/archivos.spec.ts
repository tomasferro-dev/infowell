import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Storage privado: firma de subida y control de acceso a los archivos.
 *
 * No se puede automatizar la grabación desde el micrófono (Playwright no tiene
 * micrófono real), así que se prueba el resto del camino: quién puede pedir una
 * URL de subida, qué tipos se aceptan y quién puede leer un archivo ajeno.
 * La grabación en sí se verifica a mano en Android y iOS.
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

test.describe('firma de subida', () => {
  test('el admin obtiene una URL firmada para una nota de voz', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const respuesta = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'nota-voz',
        farmId: datos.fincaPropiaId,
        recursoId: datos.pozoPropioId,
        mimeType: 'audio/webm;codecs=opus',
      },
    })

    expect(respuesta.status()).toBe(200)
    const cuerpo = await respuesta.json()

    expect(cuerpo.signedUrl).toContain('/storage/v1/object/upload/sign/notas-voz/')
    // La ruta la arma el servidor y empieza SIEMPRE por la finca.
    expect(cuerpo.ruta).toMatch(
      new RegExp(`^${datos.fincaPropiaId}/${datos.pozoPropioId}/[0-9a-f-]+\\.webm$`),
    )
  })

  test('sube el audio de verdad con la URL firmada', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const firma = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'nota-voz',
        farmId: datos.fincaPropiaId,
        recursoId: datos.pozoPropioId,
        mimeType: 'audio/webm',
      },
    })
    const { signedUrl, ruta } = await firma.json()

    // Mismo contrato que usa el navegador: PUT multipart con clave vacía.
    const subida = await page.request.fetch(signedUrl, {
      method: 'PUT',
      multipart: {
        cacheControl: '3600',
        '': { name: 'nota.webm', mimeType: 'audio/webm', buffer: Buffer.from('audio-falso') },
      },
    })

    expect(subida.ok()).toBe(true)

    // Y se puede leer por la ruta protegida (307 hacia la URL firmada).
    const lectura = await page.request.get(`/api/files/notas-voz/${ruta}`, {
      maxRedirects: 0,
    })
    expect(lectura.status()).toBe(307)
  })

  test('rechaza un tipo de archivo que no es audio', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const respuesta = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'nota-voz',
        farmId: datos.fincaPropiaId,
        recursoId: datos.pozoPropioId,
        mimeType: 'text/html',
      },
    })

    expect(respuesta.status()).toBe(400)
  })
})

test.describe('control de acceso a los archivos', () => {
  test('el cliente NO puede pedir una subida: es de solo lectura', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

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

  test('el cliente NO puede leer un archivo de una finca ajena', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    // Ruta bien formada, pero de la finca que no le corresponde.
    const respuesta = await page.request.get(
      `/api/files/notas-voz/${datos.fincaAjenaId}/${datos.pozoAjenoId}/cualquiera.webm`,
      { maxRedirects: 0 },
    )

    expect(respuesta.status()).toBe(404)
  })

  test('rechaza el salto de directorio en la ruta', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const respuesta = await page.request.get(
      '/api/files/notas-voz/..%2F..%2Fotra-cosa/x/y.webm',
      { maxRedirects: 0 },
    )

    expect(respuesta.status()).toBe(404)
  })

  test('un visitante sin sesión no obtiene nada', async ({ page }) => {
    const respuesta = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'nota-voz',
        farmId: datos.fincaPropiaId,
        recursoId: datos.pozoPropioId,
        mimeType: 'audio/webm',
      },
    })

    expect(respuesta.status()).toBe(401)
  })
})
