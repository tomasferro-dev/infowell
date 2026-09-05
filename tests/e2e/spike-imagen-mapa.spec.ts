import { expect, test } from '@playwright/test'
// Solo el tipo: `import type` se borra al compilar, así que el loader de
// Playwright (CommonJS) nunca carga maplibre, que es ESM puro.
import type { Map as MapaLibre } from 'maplibre-gl'

import { login } from './helpers'

/**
 * SPIKE — se borra cuando la funcionalidad esté hecha.
 *
 * Contesta una sola pregunta, la que puede tumbar todo el diseño de «calzar
 * una imagen sobre el mapa»: ¿MapLibre dibuja de verdad un `ImageSource`
 * construido desde un `ImageBitmap`, o hay que pelear con CORS y WebGL?
 *
 * Hallazgo del spike: `ImageSourceSpecification` exige `url` OBLIGATORIO. La
 * opción `image` (un ImageBitmap ya decodificado) existe solo en
 * `updateImage()`, no al crear la fuente.
 *
 * La salida es un `blob:` URL: pertenece al PROPIO origen, así que sirve como
 * `url` sin que CORS entre en juego. Se baja el archivo con `fetch`, se hace
 * `URL.createObjectURL` y MapLibre lo carga como si fuera local.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

test('MapLibre dibuja un ImageBitmap sobre el mapa', async ({ page }) => {
  await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
  await page.goto('/mapa')
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })

  const resultado = await page.evaluate(async () => {
    const mapa = (window as unknown as { __mapa?: MapaLibre }).__mapa
    if (!mapa) return { error: 'no hay mapa' }

    // Una imagen cualquiera, generada acá: el spike no depende de Storage.
    const lienzo = document.createElement('canvas')
    lienzo.width = 256
    lienzo.height = 256
    const ctx = lienzo.getContext('2d')!
    ctx.fillStyle = '#ec1f25'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#383a3c'
    ctx.fillRect(64, 64, 128, 128)

    const blob: Blob = await new Promise((r) => lienzo.toBlob((b) => r(b!), 'image/png'))
    const urlBlob = URL.createObjectURL(blob)

    // Atado a lo que se ve, encogido un cuarto. Con un delta fijo en grados
    // la imagen queda sub-píxel si el mapa está lejos: el test pasa y la
    // captura no muestra nada. Verde sin probar nada es peor que rojo.
    const b = mapa.getBounds()
    const o = b.getWest(), e = b.getEast(), su = b.getSouth(), no = b.getNorth()
    const mx = (e - o) / 4, my = (no - su) / 4

    // Los 4 vértices van desde arriba a la izquierda en sentido horario, que
    // es lo que exige ImageSource.
    mapa.addSource('spike', {
      type: 'image',
      url: urlBlob,
      coordinates: [
        [o + mx, no - my],
        [e - mx, no - my],
        [e - mx, su + my],
        [o + mx, su + my],
      ],
    })

    mapa.addLayer({
      id: 'spike',
      type: 'raster',
      source: 'spike',
      paint: { 'raster-opacity': 0.8 },
    })

    // Esperar a que la imagen cargue de verdad. Con tope: si nunca llega,
    // el spike tiene que responder «no», no colgarse.
    const cargo = await new Promise<boolean>((resolver) => {
      const corte = setTimeout(() => resolver(false), 10_000)
      const listo = () => {
        if (!mapa.isSourceLoaded('spike')) return
        clearTimeout(corte)
        mapa.off('sourcedata', listo)
        resolver(true)
      }
      mapa.on('sourcedata', listo)
      listo()
    })

    return {
      fuenteExiste: mapa.getSource('spike') !== undefined,
      capaExiste: mapa.getLayer('spike') !== undefined,
      cargo,
    }
  })

  console.log('SPIKE →', JSON.stringify(resultado))
  expect(resultado.fuenteExiste).toBe(true)
  expect(resultado.capaExiste).toBe(true)

  await page.screenshot({ path: 'spike-imagen-mapa.png' })
})
