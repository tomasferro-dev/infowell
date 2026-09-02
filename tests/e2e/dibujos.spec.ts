import { expect, test } from '@playwright/test'

import {
  borrarDibujos,
  elegir,
  escribir,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  type DatosTest,
} from './helpers'

/**
 * Dibujos sobre el mapa.
 *
 * Existen porque el mapa base no alcanza: el callejón de tierra que lleva a la
 * finca no figura en ningún lado, y el límite con el vecino no está marcado en
 * el terreno.
 *
 * Se verifica que se DIBUJEN, no solo que se guarden. Es una distinción que
 * costó cara: durante un buen rato los dibujos se guardaban bien, las capas
 * existían con sus datos, estaban visibles y arriba de todo, y no se veía nada
 * —faltaba el worker de maplibre—. Un test que solo mirara la base habría
 * pasado en verde todo ese tiempo.
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

/**
 * Cada test arranca con el mapa sin dibujos.
 *
 * Todos trabajan sobre la misma finca y tocan las mismas coordenadas de
 * pantalla: con los dibujos acumulándose, un test termina tocando el de otro y
 * falla por algo que no tiene nada que ver con lo que estaba probando.
 */
test.beforeEach(() => {
  borrarDibujos(marca)
})

async function esperarMapa(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-listo="true"]')).toBeVisible({ timeout: 30_000 })
}

/** Cuántas formas está pintando el mapa ahora mismo. */
/**
 * Cuántos dibujos tiene cargados el mapa, mire donde mire.
 *
 * Distinto de `pintadas`, que cuenta lo que se está dibujando EN PANTALLA. Las
 * dos preguntas son distintas y confundirlas hace fallar tests en un viewport
 * y no en otro: al guardar, el mapa puede quedar encuadrado en otro lado y el
 * dibujo existe igual.
 */
async function enElMapa(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as { __mapa?: { querySourceFeatures(f: string): unknown[] } }
    ).__mapa

    return m ? m.querySourceFeatures('anotaciones').length : -1
  })
}

async function pintadas(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as {
        __mapa?: { queryRenderedFeatures(p?: unknown, o?: unknown): unknown[] }
      }
    ).__mapa

    if (!m) return -1

    return m.queryRenderedFeatures(undefined, {
      layers: ['anotaciones-relleno', 'anotaciones-linea', 'anotaciones-punto'],
    }).length
  })
}

/** Abre el mapa en la finca del fixture y despliega sus herramientas. */
async function abrirHerramientas(page: import('@playwright/test').Page) {
  await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
  await esperarMapa(page)

  await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
  await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

  // Las herramientas están más abajo en la ficha: hay que subirla.
  const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y + agarre.height / 2)
  await page.mouse.down()
  await page.mouse.move(agarre.x + agarre.width / 2, agarre.y - 400, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

/**
 * Elige una herramienta y espera a que el mapa entre en modo dibujo.
 *
 * Con `elegir` y no con un click suelto: el botón vive en la ficha, que es
 * cliente, y el primer toque puede caer antes de la hidratación y no hacer
 * nada. Reintentar es seguro — elegir la misma herramienta dos veces es lo
 * mismo que elegirla una.
 */
async function herramienta(page: import('@playwright/test').Page, nombre: RegExp) {
  const barra = page.locator('[data-dibujando="true"]')
  // Acotado a los botones de herramienta: los dibujos ya hechos se listan en
  // la misma ficha y su nombre accesible incluye la forma, así que buscar
  // «Perímetro» a secas encuentra dos cosas distintas.
  await elegir(page.locator('[data-herramienta="true"]').filter({ hasText: nombre }), () =>
    expect(barra).toBeVisible({ timeout: 2000 }),
  )
  return barra
}

/** Toca el mapa en una posición relativa a su recuadro. */
async function tocarMapa(page: import('@playwright/test').Page, x: number, y: number) {
  const caja = (await page.locator('[data-listo="true"]').boundingBox())!
  await page.mouse.click(caja.x + caja.width * x, caja.y + caja.height * y)
  await page.waitForTimeout(400)
}

test.describe('dibujar sobre el mapa', () => {
  test('una finca se marca con cuatro toques y queda pintada', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    // Ya no hay herramienta «Rectángulo»: el perímetro hace lo mismo con
    // cuatro toques, y sostener un segundo modo de dibujo costaba más de lo
    // que ahorraba.
    const barra = await herramienta(page, /Perímetro/)
    // La ficha se va: el mapa tiene que quedar entero para dibujar.
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)

    await tocarMapa(page, 0.25, 0.2)
    await tocarMapa(page, 0.75, 0.2)
    await tocarMapa(page, 0.75, 0.45)
    await tocarMapa(page, 0.25, 0.45)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()

    await escribir(panel.getByLabel('Nombre'), `Cuadro ${marca}`)
    await panel.getByRole('radio', { name: 'celeste' }).click()
    await panel.getByRole('checkbox').check()
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByText('Dibujo guardado')).toBeVisible()

    // Y se VE. No alcanza con que esté guardado.
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('un perímetro se arma punto por punto y se puede deshacer', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const barra = await herramienta(page, /Perímetro/)

    // Con menos de tres puntos no hay perímetro que valga.
    const listo = barra.getByRole('button', { name: 'Listo' })
    await tocarMapa(page, 0.3, 0.2)
    await tocarMapa(page, 0.7, 0.25)
    await expect(listo).toBeDisabled()

    await tocarMapa(page, 0.6, 0.5)
    await expect(listo).toBeEnabled()

    // Deshacer devuelve al estado anterior, sin cancelar todo el dibujo.
    await barra.getByRole('button', { name: 'Deshacer el último punto' }).click()
    await expect(listo).toBeDisabled()
    await expect(barra).toBeVisible()

    await tocarMapa(page, 0.55, 0.55)
    await listo.click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await escribir(panel.getByLabel('Nombre'), `Perímetro ${marca}`)
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => enElMapa(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('una referencia suelta se marca con un toque y lleva su explicación', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const barra = await herramienta(page, /Referencia/)
    await tocarMapa(page, 0.5, 0.3)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await escribir(panel.getByLabel('Nombre'), `Entrada ${marca}`)
    await escribir(
      panel.getByLabel('Cómo se llega'),
      'Sobre la ruta, doblar a la derecha en el callejón de tierra.',
    )
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => enElMapa(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('se puede cancelar sin guardar nada', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    const antes = await pintadas(page)

    const barra = await herramienta(page, /Línea/)
    await tocarMapa(page, 0.3, 0.3)
    await tocarMapa(page, 0.6, 0.4)

    await barra.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.locator('[data-dibujando="true"]')).toHaveCount(0)
    await expect(page.locator('[data-panel-dibujo="true"]')).toHaveCount(0)
    await expect.poll(() => pintadas(page)).toBe(antes)
  })

  test('los dibujos se pueden apagar cuando estorban', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    // Primero uno, para tener algo que apagar.
    const barra = await herramienta(page, /Perímetro/)
    await tocarMapa(page, 0.25, 0.2)
    await tocarMapa(page, 0.75, 0.2)
    await tocarMapa(page, 0.75, 0.45)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)

    // Con muchos encimados tapan la imagen: se apagan de una.
    await page.getByRole('button', { name: 'Dibujos' }).click()
    await expect.poll(() => pintadas(page)).toBe(0)

    await page.getByRole('button', { name: 'Ocultos' }).click()
    await expect.poll(() => pintadas(page)).toBeGreaterThan(0)
  })
})

test.describe('la ficha no se queda con la app', () => {
  test('al cerrarla, la página vuelve a existir para un lector de pantalla', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await abrirHerramientas(page)

    // Abrir la ficha y entrar a dibujar: vaul marca el resto de la página con
    // aria-hidden y no siempre lo limpia. Se veía todo bien en pantalla y la
    // app entera había desaparecido para quien usa lector de pantalla.
    await herramienta(page, /Línea/)

    const raizOculta = await page.evaluate(() =>
      Boolean(document.querySelector('main')?.closest('[aria-hidden="true"]')),
    )
    expect(raizOculta, 'la app no puede quedar oculta para el lector').toBe(false)

    // Y los botones de la barra son alcanzables por su rol, que es la prueba
    // de que están en el árbol de accesibilidad.
    await expect(
      page.locator('[data-dibujando="true"]').getByRole('button', { name: 'Cancelar' }),
    ).toBeVisible()
  })
})

test.describe('quién puede dibujar', () => {
  test('el CLIENTE ve los dibujos pero no puede hacer ninguno', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    // Es de solo lectura: el mapa le sirve para orientarse, no para escribir.
    await expect(ficha.getByText('Dibujar en el mapa')).toHaveCount(0)
    await expect(ficha.locator('[data-herramienta="true"]')).toHaveCount(0)
  })
})

/**
 * Espera a que un panel deje de moverse.
 *
 * Los paneles entran con animación y Playwright exige que el elemento esté
 * quieto antes de tocarlo. Sin esto el click se queda esperando la estabilidad
 * hasta agotar el tiempo, y el error habla de «element is not stable» en vez
 * de decir que la animación todavía corre.
 */
async function esperarQuieto(locator: import('@playwright/test').Locator) {
  let previa = ''
  await expect
    .poll(async () => {
      const caja = await locator.boundingBox()
      const actual = JSON.stringify(caja)
      const quieto = actual === previa && caja !== null
      previa = actual
      return quieto
    })
    .toBe(true)
}

test.describe('corregir y borrar un dibujo', () => {
  /** Deja un perímetro hecho y devuelve su nombre. */
  async function dejarUnDibujo(page: import('@playwright/test').Page, nombre: string) {
    await abrirHerramientas(page)
    const barra = await herramienta(page, /Perímetro/)

    // La ficha se va al elegir la herramienta, pero con animación: un toque
    // que llegue antes cae sobre ella y no sobre el mapa, y el vértice se
    // pierde sin que nada avise.
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)

    // Se confirma cada vértice: el contador de la barra dice cuántos van.
    const puntos = [
      [0.3, 0.25],
      [0.7, 0.25],
      [0.7, 0.5],
    ] as const

    // Se confirma cada vértice, pero SIN reintentar el toque: agregar un
    // punto no es idempotente, y reintentar sumaba vértices de más que
    // deformaban la figura. Si un toque se pierde, que falle y se vea.
    const contador = page.locator('[data-contador-dibujo="true"]')

    for (const [i, [x, y]] of puntos.entries()) {
      await tocarMapa(page, x, y)
      await expect(contador).toContainText(`${i + 1} punto`)
    }

    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await escribir(panel.getByLabel('Nombre'), nombre)
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => enElMapa(page), { timeout: 20_000 }).toBeGreaterThan(0)
  }

  test('se toca en el mapa y se abre para corregirlo', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const nombre = `Límite a corregir ${marca}`
    await dejarUnDibujo(page, nombre)

    // Se toca el BORDE y no el interior: sin relleno, el interior no es parte
    // del dibujo. Para eso está la capa de contacto, más ancha que la línea
    // visible — nadie le acierta a tres píxeles con el pulgar.
    //
    // Y se toca el borde DERECHO: en el medio del mapa están los marcadores de
    // la finca y su pozo, que se llevan el toque para sí.
    await tocarMapa(page, 0.7, 0.4)

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await expect(panel.getByLabel('Nombre')).toHaveValue(nombre)

    // Y dice a qué pertenece: es lo que distingue el límite de una finca del
    // de la vecina cuando se tocan en el mapa.
    await expect(panel.getByText(new RegExp(`${marca} Finca Propia`))).toBeVisible()

    const corregido = `${nombre} corregido`
    await escribir(panel.getByLabel('Nombre'), corregido)
    // Se confirma justo antes de guardar: si el panel se reinicia entre que se
    // escribe y se toca Guardar, se estaría guardando el texto viejo y el test
    // fallaría después, en un lugar que no tiene nada que ver.
    await expect(panel.getByLabel('Nombre')).toHaveValue(corregido)
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })

    // Se mira lo que el mapa tiene cargado, que es la prueba de que el cambio
    // llegó al dibujo y no solo al formulario.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const m = (window as unknown as { __mapa?: { querySourceFeatures(f: string): { properties?: Record<string, unknown> }[] } }).__mapa
            if (!m) return []
            return m.querySourceFeatures('anotaciones').map((f) => f.properties?.etiqueta)
          }),
        { timeout: 25_000 },
      )
      .toContain(corregido)
  })

  test('se borra desde el mapa y deja de dibujarse', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await dejarUnDibujo(page, `Límite a borrar ${marca}`)

    const antes = await pintadas(page)

    await tocarMapa(page, 0.7, 0.4)
    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await esperarQuieto(panel)
    await panel.getByRole('button', { name: 'Borrar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    // No alcanza con que salga de la base: tiene que dejar de verse.
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeLessThan(antes)
  })

  test('la ficha de la finca lista sus dibujos y lleva a cada uno', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const nombre = `Listado ${marca}`
    await dejarUnDibujo(page, nombre)

    // Encontrarlos recorriendo el mapa a ojo no es forma.
    await abrirHerramientas(page)
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha.getByText('Dibujos de esta finca')).toBeVisible()

    await ficha.getByRole('button', { name: new RegExp(nombre) }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await expect(panel.getByLabel('Nombre')).toHaveValue(nombre)
  })

  test('el CLIENTE puede tocar un dibujo pero no se le abre el editor', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await dejarUnDibujo(page, `Solo lectura ${marca}`)

    await login(page, `${marca}-cliente@test.local`)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)
    // Lo recibe: el mapa le sirve para orientarse.
    await expect.poll(() => enElMapa(page), { timeout: 20_000 }).toBeGreaterThan(0)

    // Pero tocarlo no le abre nada.
    await tocarMapa(page, 0.7, 0.4)
    await page.waitForTimeout(1200)
    await expect(page.locator('[data-panel-dibujo="true"]')).toHaveCount(0)
  })
})

test.describe('de qué cuelga cada dibujo', () => {
  test('un pozo también puede tener los suyos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    // En una finca grande, «cómo se llega al cabezal» es del pozo y no de la
    // finca entera.
    await page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`).click()
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
    await page.mouse.move(agarre.x + agarre.width / 2, agarre.y + agarre.height / 2)
    await page.mouse.down()
    await page.mouse.move(agarre.x + agarre.width / 2, agarre.y - 400, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(900)

    const barra = page.locator('[data-dibujando="true"]')
    await elegir(
      page.locator('[data-herramienta="true"]').filter({ hasText: /Referencia/ }),
      () => expect(barra).toBeVisible({ timeout: 2000 }),
    )
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)
    await tocarMapa(page, 0.4, 0.35)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    // Dice que es del POZO, no de la finca.
    await expect(panel.getByText(new RegExp(`Pozo ${marca}`))).toBeVisible()

    await escribir(panel.getByLabel('Nombre'), `Cabezal ${marca}`)
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => pintadas(page), { timeout: 20_000 }).toBeGreaterThan(0)

    // Y aparece en la ficha del pozo, no en la de la finca.
    await page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`).click()
    await expect(ficha.getByText('Dibujos de este pozo')).toBeVisible()
    await expect(ficha.getByRole('button', { name: new RegExp(`Cabezal ${marca}`) })).toBeVisible()
    expect(barra).toBeTruthy()
  })

  test('una referencia suelta no necesita ninguna finca', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    // Muchas veces la referencia es justamente para llegar a una finca que
    // todavía no está cargada: exigir una finca la haría inútil.
    await page.getByRole('button', { name: 'Referencia' }).click()
    const barra = page.locator('[data-dibujando="true"]')
    await expect(barra).toBeVisible()
    await tocarMapa(page, 0.5, 0.4)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Punto suelto')).toBeVisible()

    await escribir(panel.getByLabel('Nombre'), `Entrada del callejón ${marca}`)
    await escribir(panel.getByLabel('Cómo se llega'), 'Sobre la ruta, doblar a la derecha')
    await panel.getByRole('button', { name: 'Guardar' }).click()

    await expect(panel).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(() => enElMapa(page), { timeout: 20_000 }).toBeGreaterThan(0)
  })

  test('el CLIENTE no recibe las referencias sueltas, ni para verlas', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/mapa')
    await esperarMapa(page)

    const secreto = `Referencia interna ${marca}`
    await page.getByRole('button', { name: 'Referencia' }).click()
    const barra = page.locator('[data-dibujando="true"]')
    await expect(barra).toBeVisible()
    await tocarMapa(page, 0.5, 0.4)
    await barra.getByRole('button', { name: 'Listo' }).click()

    const panel = page.locator('[data-panel-dibujo="true"]')
    await escribir(panel.getByLabel('Nombre'), secreto)
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toHaveCount(0, { timeout: 20_000 })

    // Un punto suelto no cuelga de ninguna finca, así que queda fuera de la
    // cadena que garantiza el aislamiento: es interno. Y sus nombres podrían
    // delatarle a un cliente dónde están las fincas de otros.
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/mapa')
    await esperarMapa(page)

    const html = await page.content()
    expect(html, 'el nombre de una referencia interna no puede viajar').not.toContain(secreto)

    // Y tampoco se le ofrece marcarlas.
    await expect(page.getByRole('button', { name: 'Referencia' })).toHaveCount(0)
  })
})
