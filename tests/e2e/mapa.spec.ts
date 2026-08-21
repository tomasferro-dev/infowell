import { expect, test } from '@playwright/test'

import { escribir, limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * El mapa satelital.
 *
 * Lo que más importa acá NO es que se vea la imagen sino que el mapa respete
 * el mismo cerco que el resto de la app: es una vista que junta TODAS las
 * fincas en una sola pantalla, así que un filtro mal puesto no se vería como
 * una fuga — se vería como un par de pines de más.
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

/** El mapa existe recién cuando maplibre terminó de montarse. */
async function esperarMapa(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
}

test.describe('llegar al mapa', () => {
  test('el inicio ofrece un botón ancho que lleva al mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.getByRole('link', { name: 'Ir al mapa' }).click()
    await expect(page).toHaveURL('/mapa')

    await esperarMapa(page)
  })
})

test.describe('los puntos del mapa', () => {
  test('dibuja las fincas y, al acercarse, sus pozos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    // De lejos los pozos se esconden: están a metros del casco y los pines se
    // pisarían entre sí. Ver ZOOM_POZOS en mapa.tsx.
    await expect(page.locator('.marcador-mapa[data-tipo="finca"]').first()).toBeVisible()
    await expect(
      page.locator('.marcador-mapa[data-tipo="pozo"]:not([data-oculto="true"])'),
    ).toHaveCount(0)

    // Entrando encuadrado en una finca, en cambio, sus pozos ya se ven.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await expect(page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)).toBeVisible()
  })

  test('la ficha del pozo trae su último estado y las acciones', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se apunta AL pozo del fixture y no a "el primero que aparezca": el mapa
    // muestra todas las fincas, y con .first() el test terminaba abriendo un
    // pozo de otro lado —o uno recién creado por otro test, sin mediciones—.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    const pozo = page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)
    await expect(pozo).toBeVisible()
    await pozo.click()

    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    // Las mediciones, que es a lo que se va: no alcanza con el nombre.
    await expect(ficha.getByText('Profundidad')).toBeVisible()
    await expect(ficha.getByText('Nivel estático')).toBeVisible()
    await expect(ficha.getByText('Caudal')).toBeVisible()

    // Y se puede cargar trabajo sin salir del mapa.
    await expect(ficha.getByRole('link', { name: 'Cargar una intervención' })).toBeVisible()
  })

  test('el punto elegido queda a la vista y no detrás de la ficha', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se entra encuadrado en la finca del fixture: a zoom amplio los pines de
    // fincas cercanas se pisan y el de atrás no se puede tocar.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // Es el punto del feature: la ficha ocupa el 70% de abajo, así que el
    // mapa tiene que reencuadrar o el usuario mira un punto que no ve.
    await expect(async () => {
      const tapado = await page.evaluate(() => {
        const activo = document.querySelector('.marcador-mapa[data-activo="true"]')
        const ficha = document.querySelector('[data-vaul-drawer]')
        if (!activo || !ficha) return true
        return activo.getBoundingClientRect().bottom > ficha.getBoundingClientRect().top
      })
      expect(tapado).toBe(false)
    }).toPass({ timeout: 10_000 })
  })

  test('con la ficha abierta el mapa sigue respondiendo', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se entra encuadrado en la finca del fixture: a zoom amplio los pines de
    // fincas cercanas se pisan y el de atrás no se puede tocar.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // vaul se apoya en Radix, que apaga los eventos del body aunque el drawer
    // sea no-modal. Si esto se rompe, tocar otro punto deja de funcionar y no
    // hay ningún error que lo delate. Se toca sin force a propósito.
    const pozo = page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)
    await expect(pozo).toBeVisible()
    await pozo.click()

    await expect(page.locator('[data-vaul-drawer]').getByText('Profundidad')).toBeVisible()
  })
})

test.describe('crear un pozo desde el mapa', () => {
  test('se marca el punto con la mira y llega cargado al formulario', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se entra encuadrado en la finca del fixture: a zoom amplio los pines de
    // fincas cercanas se pisan y el de atrás no se puede tocar.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await page.getByRole('button', { name: 'Agregar un pozo acá' }).click()

    // La ficha se va: el mapa tiene que quedar entero para poder apuntar.
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)
    await expect(page.getByText(/Movés el mapa hasta poner la mira/)).toBeVisible()

    const barra = page.locator('[data-colocando="true"]')
    await expect(barra).toBeVisible()

    // La lectura del centro aparece antes de poder confirmar.
    const lectura = barra.locator('p').first()
    await expect(lectura).toHaveText(/-?\d+\.\d{6}, -?\d+\.\d{6}/)
    const coordenadas = (await lectura.textContent())!.trim()

    await page.getByRole('button', { name: 'Poner el pozo acá' }).click()

    // El formulario abre con la ubicación ya puesta y diciendo de dónde salió.
    await expect(page).toHaveURL(/\/pozos\/nuevo\?lat=/)
    await expect(page.getByRole('heading', { name: 'Nuevo pozo' })).toBeVisible()
    await expect(page.getByText('Marcada en el mapa')).toBeVisible()

    // Y es EXACTAMENTE el punto que se marcó, no uno parecido.
    await expect(page.getByText(coordenadas)).toBeVisible()
  })

  test('el pozo queda guardado con esa ubicación y vuelve al mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se entra encuadrado en la finca del fixture: a zoom amplio los pines de
    // fincas cercanas se pisan y el de atrás no se puede tocar.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await page.getByRole('button', { name: 'Agregar un pozo acá' }).click()
    await expect(page.locator('[data-colocando="true"]')).toBeVisible()
    await page.getByRole('button', { name: 'Poner el pozo acá' }).click()

    const nombre = `Pozo del mapa ${marca}`
    await escribir(page.getByLabel('Nombre del pozo'), nombre)
    await page.getByRole('button', { name: 'Crear pozo' }).click()

    // Vuelve al mapa, que es de donde salió: mandarlo a la finca sería
    // sacarlo del contexto en el que estaba trabajando.
    await expect(page).toHaveURL('/mapa')
    await esperarMapa(page)

    // Y el pozo nuevo ya está dibujado, sin recargar a mano.
    await expect(page.locator(`.marcador-mapa[aria-label="Pozo ${nombre}"]`)).toHaveCount(1)
  })

  test('se puede cancelar sin crear nada', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Se entra encuadrado en la finca del fixture: a zoom amplio los pines de
    // fincas cercanas se pisan y el de atrás no se puede tocar.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    await page.getByRole('button', { name: 'Agregar un pozo acá' }).click()
    await expect(page.locator('[data-colocando="true"]')).toBeVisible()

    await page.getByRole('button', { name: 'Cancelar' }).click()

    // Vuelve al mapa tal cual estaba, sin haber creado nada.
    await expect(page.locator('[data-colocando="true"]')).toHaveCount(0)
    await expect(page.locator('.marcador-mapa').first()).toBeVisible()
  })

  test('una coordenada inventada en la URL se descarta, no rompe el alta', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    // La URL la escribe cualquiera. El formulario tiene que abrir usable.
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo?lat=no-es-un-numero&lon=999`)

    await expect(page.getByRole('heading', { name: 'Nuevo pozo' })).toBeVisible()
    await expect(page.getByText('Marcada en el mapa')).toHaveCount(0)
    // Y queda la vía normal: marcar con el GPS.
    await expect(page.getByRole('button', { name: 'Marcar con GPS' })).toBeVisible()
  })
})

test.describe('el mapa respeta el alcance de cada rol', () => {
  test('el CLIENTE solo ve los puntos de su finca', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/mapa')

    // La finca ajena del fixture NO tiene por qué aparecer en ninguna forma.
    await expect(page.getByText(`${marca} Finca Ajena`)).toHaveCount(0)

    // Y el payload que viaja al navegador tampoco puede traerla: el mapa manda
    // TODAS las coordenadas al cliente de una, así que filtrar en la vista no
    // alcanzaría.
    const html = await page.content()
    expect(html).not.toContain(datos.fincaAjenaId)
    expect(html).not.toContain(datos.pozoAjenoId)
  })

  test('el CARGADOR tampoco alcanza las fincas que no tiene asignadas', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto('/mapa')

    const html = await page.content()
    expect(html).not.toContain(datos.fincaAjenaId)
    expect(html).not.toContain(datos.pozoAjenoId)
  })
})
