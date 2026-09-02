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

    await page.getByRole('button', { name: 'Marcar acá' }).click()

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
    await page.getByRole('button', { name: 'Marcar acá' }).click()

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

test.describe('elegir el punto en el mapa desde el formulario', () => {
  test('lleva lo ya escrito, y vuelve con la ubicación y el texto intactos', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/nuevo`)

    // El GPS solo sirve estando parado sobre el pozo; desde la oficina hay que
    // poder marcarlo sobre la imagen.
    const nombre = `Pozo desde el form ${marca}`
    await escribir(page.getByLabel('Nombre del pozo'), nombre)
    await escribir(page.getByLabel('Código interno'), 'PF-9')

    await page.getByRole('button', { name: 'Elegir en el mapa' }).click()

    await expect(page).toHaveURL(/\/mapa\?/)
    await esperarMapa(page)
    await expect(page.locator('[data-colocando="true"]')).toBeVisible()

    await page.getByRole('button', { name: 'Marcar acá' }).click()

    // Vuelve al alta con la ubicación puesta Y sin haber perdido lo escrito,
    // que es lo que haría que nadie use el botón una segunda vez.
    await expect(page).toHaveURL(/\/pozos\/nuevo\?/)
    await expect(page.getByText('Marcada en el mapa')).toBeVisible()
    await expect(page.getByLabel('Nombre del pozo')).toHaveValue(nombre)
    await expect(page.getByLabel('Código interno')).toHaveValue('PF-9')

    await page.getByRole('button', { name: 'Crear pozo' }).click()
    await expect(page).toHaveURL('/mapa')
    await esperarMapa(page)
    await expect(page.locator(`.marcador-mapa[aria-label="Pozo ${nombre}"]`)).toHaveCount(1)
  })

  test('una finca nueva también se puede ubicar desde el mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto('/fincas/nueva')

    const nombre = `Finca del mapa ${marca}`
    await escribir(page.getByLabel('Nombre o razón social'), nombre)
    await escribir(page.getByLabel('Localidad'), 'Tupungato')

    await page.getByRole('button', { name: 'Elegir en el mapa' }).click()
    await expect(page).toHaveURL(/\/mapa\?/)
    await esperarMapa(page)

    // Una finca nueva no tiene punto de partida: se coloca sobre lo que el
    // usuario esté mirando, no en 0,0.
    await expect(page.getByText(/Movés el mapa hasta poner la mira sobre la finca/)).toBeVisible()
    await page.getByRole('button', { name: 'Marcar acá' }).click()

    await expect(page).toHaveURL(/\/fincas\/nueva\?/)
    await expect(page.getByText('Marcada en el mapa')).toBeVisible()
    await expect(page.getByLabel('Nombre o razón social')).toHaveValue(nombre)
    await expect(page.getByLabel('Localidad')).toHaveValue('Tupungato')

    await page.getByRole('button', { name: 'Crear finca' }).click()
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()

    // Y quedó ubicada: aparece el enlace al mapa, que solo sale si tiene punto.
    await expect(page.getByRole('link', { name: 'Mapa' })).toBeVisible()
  })

  test('también se puede corregir la ubicación de un pozo ya cargado', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}/editar`)

    await expect(page.getByRole('heading', { name: 'Editar pozo' })).toBeVisible()
    const nombre = await page.getByLabel('Nombre del pozo').inputValue()

    // Es justo cuando más se necesita: el pozo quedó mal ubicado y hay que
    // moverlo. Si el botón solo existiera al crear, no habría forma.
    await page.getByRole('button', { name: 'Elegir en el mapa' }).click()
    await esperarMapa(page)
    await expect(page.locator('[data-colocando="true"]')).toBeVisible()
    await page.getByRole('button', { name: 'Marcar acá' }).click()

    // Vuelve a la EDICIÓN, no al alta.
    await expect(page).toHaveURL(/\/pozos\/[^/]+\/editar\?/)
    await expect(page.getByText('Marcada en el mapa')).toBeVisible()
    await expect(page.getByLabel('Nombre del pozo')).toHaveValue(nombre)
  })
})

/**
 * Arrastra la ficha tomándola por el agarre. Negativo la sube.
 *
 * Espera a que termine la animación antes de volver: si no, el gesto siguiente
 * mide el agarre mientras se está moviendo, apoya el dedo donde ya no está y
 * no arrastra nada. El síntoma es una ficha que "no responde" en el test y
 * responde perfecto a mano.
 */
async function arrastrarAgarre(page: import('@playwright/test').Page, px: number) {
  const agarre = (await page.locator('[data-agarre="true"]').boundingBox())!
  const x = agarre.x + agarre.width / 2
  const y = agarre.y + agarre.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + px, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

test.describe('la ficha tiene dos alturas', () => {
  /** Cuánta pantalla ocupa la ficha, en porcentaje. */
  async function alturaFicha(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const d = document.querySelector('[data-vaul-drawer]')
      if (!d) return 0
      const alto = window.innerHeight
      return Math.round(((alto - d.getBoundingClientRect().top) / alto) * 100)
    })
  }

  test('abre chica y se puede subir arrastrando', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    await expect(page.locator('[data-vaul-drawer]')).toBeVisible()

    // Abre mostrando lo esencial y dejando ver el mapa. Si esto se rompe, se
    // rompe hacia el lado peligroso: vaul deja la ficha asomando apenas por el
    // borde, sin tirar ningún error. Ver el comentario en ficha-mapa.tsx.
    await expect.poll(() => alturaFicha(page)).toBeGreaterThan(25)
    await expect.poll(() => alturaFicha(page)).toBeLessThan(45)

    // Lo esencial es el nombre y las primeras filas de datos.
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha.getByText('Pozos')).toBeVisible()
    await expect(ficha.getByText('Coordenadas')).toBeVisible()

    // Arrastrando el agarre se sube al tope grande.
    await arrastrarAgarre(page, -220)

    await expect.poll(() => alturaFicha(page)).toBeGreaterThan(50)
    await expect.poll(() => alturaFicha(page)).toBeLessThan(70)
  })

  test('se puede subir del todo para leer, sin salir del mapa', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    // Se arrastra desde el agarre, tomándolo por su centro: apuntar a un
    // desplazamiento en píxeles desde el borde de la ficha depende del alto de
    // la pantalla, y falla en un viewport y en otro no.
    const arrastrar = (px: number) => arrastrarAgarre(page, px)
    const subir = (px: number) => arrastrar(-px)

    await subir(220)
    await expect.poll(() => alturaFicha(page)).toBeGreaterThan(50)

    // Y de ahí, otro tirón la sube del todo.
    await subir(300)
    await expect.poll(() => alturaFicha(page)).toBeGreaterThan(85)

    // Tapa el mapa pero NO sale de él: la ruta sigue siendo la misma y el
    // mapa está ahí atrás, con el punto todavía seleccionado.
    await expect(page).toHaveURL(/\/mapa/)
    await expect(page.locator('.marcador-mapa[data-activo="true"]')).toHaveCount(1)

    // Y se baja de nuevo, dejando todo como estaba.
    await arrastrar(320)
    await expect.poll(() => alturaFicha(page)).toBeLessThan(70)
    await expect(ficha).toBeVisible()
  })

  test('el encuadre acompaña: el punto no queda tapado en ningún tope', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    await page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`).click()
    const ficha = page.locator('[data-vaul-drawer]')
    await expect(ficha).toBeVisible()

    const tapado = () =>
      page.evaluate(() => {
        const activo = document.querySelector('.marcador-mapa[data-activo="true"]')
        const d = document.querySelector('[data-vaul-drawer]')
        if (!activo || !d) return true
        return activo.getBoundingClientRect().bottom > d.getBoundingClientRect().top
      })

    await expect.poll(tapado).toBe(false)

    await arrastrarAgarre(page, -220)

    // Al subir la ficha el mapa tiene que correrse, o el punto que se está
    // mirando desaparece detrás de ella.
    await expect(page.locator('[data-alto-ficha="0.6"]')).toBeVisible()
    await expect.poll(tapado).toBe(false)
  })
})

test.describe('cada punto se identifica solo', () => {
  test('la finca lleva dos letras de su nombre y el pozo su número', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    // Sin rótulo, diez pines iguales sobre una imagen satelital obligan a
    // tocarlos de a uno para saber cuál es cuál.
    const finca = page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`)
    await expect(finca).toHaveText(/^[A-Z0-9]{2}$/)

    const pozo = page.locator(`.marcador-mapa[data-id="${datos.pozoPropioId}"]`)
    await expect(pozo).toBeVisible()
    await expect(pozo).toHaveText(/^\d+$/)

    // El rótulo es texto de verdad: un lector de pantalla igual anuncia el
    // nombre completo, que es lo que sirve para quien no ve el mapa.
    await expect(finca).toHaveAttribute('aria-label', /Finca /)
    await expect(pozo).toHaveAttribute('aria-label', /Pozo /)
  })

  test('ningún pozo del mapa se queda sin número', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    // Encuadrado en la finca: viendo todo el mapa de una, los pines de dos
    // fincas cercanas se pisan y el toque se lo lleva el de arriba.
    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    const rotulos = await page
      .locator('.marcador-mapa[data-tipo="pozo"]')
      .allTextContents()

    expect(rotulos.length).toBeGreaterThan(0)
    for (const r of rotulos) {
      expect(r, 'un pozo sin número no se puede nombrar en voz alta').toMatch(/^\d+$/)
    }
  })
})

test.describe('el mapa recuerda dónde quedó', () => {
  test('volviendo de otra pantalla retoma la misma vista', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    await page.goto(`/mapa?punto=${datos.fincaPropiaId}`)
    await esperarMapa(page)

    const marcador = page.locator(`.marcador-mapa[data-id="${datos.fincaPropiaId}"]`)
    await expect(marcador).toBeVisible()

    // Se cierra la ficha antes de medir. Con la ficha abierta el encuadre
    // descuenta su altura, y al volver —sin ficha— el mismo centro dibuja el
    // marcador unos píxeles más abajo: se estaría midiendo eso y no la memoria.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-vaul-drawer]')).toHaveCount(0)
    await expect(page.locator('[data-alto-ficha="0"]')).toBeVisible()
    await page.waitForTimeout(600)

    const antes = (await marcador.boundingBox())!

    // Se va y vuelve, como quien entra a cargar algo y regresa.
    await page.goto('/fincas')
    await expect(page.getByRole('heading', { name: 'Fincas' })).toBeVisible()
    await page.goto('/mapa')
    await esperarMapa(page)

    await expect(marcador).toBeVisible()
    const despues = (await marcador.boundingBox())!

    // Sin memoria, el mapa volvería a encuadrar todo o a pedir el GPS, y el
    // usuario perdería el lugar que venía mirando.
    expect(Math.abs(despues.x - antes.x)).toBeLessThan(12)
    expect(Math.abs(despues.y - antes.y)).toBeLessThan(12)
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
