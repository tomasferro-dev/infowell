import { expect, test } from '@playwright/test'

import { escribir, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * Cargar un remito sin señal.
 *
 * Se corta la red de verdad con `context.setOffline`, no se simula: lo que hay
 * que probar es que un fetch que NO sale termine en la cola y no en la nada.
 *
 * La regla que ordena estos tests es la de §10 de la bitácora: si falla en
 * silencio, el operario cree que guardó y no guardó. Por eso se verifica tanto
 * que el dato sobreviva como que la pantalla lo DIGA.
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

/** Un JPEG chico y válido, para no depender de la cámara. */
const FOTO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////' +
    '////////////////////////////////////////////////////2wBDAf//////////////////' +
    '////////////////////////////////////////////////////////////////////////wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAA' +
    'AAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhED' +
    'EQA/AJgA/9k=',
  'base64',
)

async function cargarRemito(page: import('@playwright/test').Page, farmId: string) {
  await page.goto(`/fincas/${farmId}/remitos/nuevo`)
  await escribir(page.getByLabel('Monto'), '15000,50')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'remito.jpg',
    mimeType: 'image/jpeg',
    buffer: FOTO,
  })
  // La foto se comprime antes de quedar lista.
  await expect(page.getByText('Achicando fotos…')).toHaveCount(0, { timeout: 20_000 })
}

test.describe('cargar un remito sin señal', () => {
  test.describe.configure({ mode: 'serial' })

  /**
   * Todo en UN test a propósito.
   *
   * Cada test de Playwright arranca con un contexto nuevo, y la cola vive en
   * IndexedDB, que es POR CONTEXTO. Partido en dos, el segundo abriría un
   * navegador sin cola: vería el aviso ausente y lo tomaría por «subió»
   * cuando en realidad no había nada. Verde sin probar nada.
   */
  test('sin red se guarda y se dice; con red vuelve y sube solo', async ({
    page,
    context,
  }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await cargarRemito(page, datos.fincaPropiaId)

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    // Lo DICE, y dice la verdad: guardado en el teléfono, no «guardado».
    await expect(page.getByText(/guardado en el tel[ée]fono/i)).toBeVisible({
      timeout: 20_000,
    })

    // Y queda a la vista.
    const aviso = page.locator('[data-remitos-pendientes]')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('1 remito sin subir')

    // Sin señal NO se navega: ir al listado llevaría a la pantalla de «Sin
    // conexión», donde el operario no vería nada de lo que cargó. Se queda en
    // el formulario, limpio para el siguiente.
    await expect(page).toHaveURL(new RegExp('/remitos/nuevo$'))
    await expect(page.getByLabel('Monto')).toHaveValue('')

    // Vuelve la señal: el evento `online` dispara el reintento solo.
    await context.setOffline(false)

    // El aviso se va cuando la cola queda vacía: eso es que subió.
    await expect(aviso).toHaveCount(0, { timeout: 60_000 })

    // Y está en la finca de verdad, no solo desaparecido de la cola.
    //
    // Con `toContainText` sobre `main` y no con `getByText`: el monto se
    // formatea con espacio duro (U+00A0) y aparece dos veces en la página —en
    // el total y en la fila—, así que un localizador por texto exacto no sirve.
    await page.goto(`/fincas/${datos.fincaPropiaId}/remitos`)
    await expect(page.locator('main')).toContainText(/15\.000,50/, { timeout: 20_000 })
  })

  test('con señal guarda directo, sin pasar por la cola', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await cargarRemito(page, datos.fincaPropiaId)

    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page).toHaveURL(new RegExp(`/fincas/${datos.fincaPropiaId}/remitos$`), {
      timeout: 30_000,
    })
    await expect(page.locator('[data-remitos-pendientes]')).toHaveCount(0)
  })

  /**
   * El otro lado de la moneda: un rechazo del servidor NO se encola. Si se
   * encolara, se reintentaría para siempre algo que nunca va a andar y el
   * operario vería «pendiente» sin entender por qué.
   */
  test('un dato inválido se muestra y NO se encola', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/remitos/nuevo`)

    await escribir(page.getByLabel('Monto'), '0')
    await page.getByRole('button', { name: 'Guardar remito' }).click()

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-remitos-pendientes]')).toHaveCount(0)
  })
})
