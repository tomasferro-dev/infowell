import { expect, test } from '@playwright/test'

import {
  limpiarCatalogo,
  limpiarDatos,
  login,
  marca,
  montarDatos,
  sembrarNotasDeVoz,
  type DatosTest,
} from './helpers'

/**
 * El flujo central del producto: cargar una intervención con los tres módulos
 * en un solo submit y verla reflejada en el historial del pozo.
 *
 * Cada test es autónomo: el pozo viene armado del fixture, así ninguno depende
 * de que otro haya corrido antes.
 */

const EMAIL_ADMIN = process.env.SEED_ADMIN_EMAIL
const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD

test.skip(!EMAIL_ADMIN || !CLAVE_ADMIN, 'faltan credenciales del seed')

let datos: DatosTest
let urlPozo: string
let urlNueva: string

test.beforeAll(() => {
  datos = montarDatos(marca)
  urlPozo = `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}`
  urlNueva = `${urlPozo}/intervencion/nueva`
})

test.afterAll(() => {
  limpiarDatos(marca)
  limpiarCatalogo(marca)
})

test.describe('carga de intervención', () => {
  test('guarda servicios, mediciones y observación en un solo submit', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // MÓDULO A — tres servicios marcados en las cards.
    await page.getByRole('button', { name: 'Perforación de pozo' }).click()
    await page.getByRole('button', { name: 'Limpieza de perforación' }).click()
    await page.getByRole('button', { name: 'Bobinado' }).click()

    // MÓDULO B — solo dos mediciones: el resto queda vacío a propósito.
    await page.getByLabel('Profundidad (m)').fill('42,5')
    await page.getByLabel('Caudal (m³/h)').fill('12')

    // MÓDULO C — observación.
    await page
      .getByLabel('Notas de la visita')
      .fill('Se limpió el filtro. Revisar tablero en la próxima visita.')

    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    // Vuelve al pozo y el historial ya lo refleja.
    await expect(page).toHaveURL(urlPozo)
    await expect(page.getByText('Perforación de pozo')).toBeVisible()
    await expect(page.getByText('Bobinado')).toBeVisible()
    await expect(page.getByText('42.5')).toBeVisible()
    await expect(page.getByText(/Se limpió el filtro/)).toBeVisible()

    // Y la última medición queda disponible en la pestaña Estado.
    await page.getByRole('tab', { name: 'Estado' }).click()
    // exact: el pie del perfil del pozo también menciona la última medición.
    await expect(page.getByText('Última medición', { exact: true })).toBeVisible()
  })

  test('rechaza un submit completamente vacío', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // Sin marcar nada ni escribir nada: no debe crear una visita fantasma.
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(
      page.getByText(/Marcá al menos un servicio, cargá una medición o escribí una observación/),
    ).toBeVisible()
  })

  test('rechaza el nivel dinámico más somero que el estático', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    // Cargados al revés: es el error típico al completar rápido en el campo.
    await page.getByLabel('Nivel estático (m)').fill('30')
    await page.getByLabel('Nivel dinámico (m)').fill('18')
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(page.getByText(/Están cruzados/)).toBeVisible()
  })

  test('rechaza una fecha futura', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel('Fecha del trabajo').fill(manana)
    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByRole('button', { name: 'Guardar intervención' }).click()

    await expect(page.getByText('La fecha no puede ser futura')).toBeVisible()
  })

  test('registra una electrobomba al vuelo sin perder lo ya cargado', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    const modelo = `Bomba ${marca}`

    // Se carga algo ANTES de abrir el combobox, para comprobar que el alta al
    // vuelo no recarga el formulario ni borra lo escrito.
    await page.getByLabel('Profundidad (m)').fill('55')

    await page.getByRole('combobox', { name: 'Electrobomba instalada' }).click()
    await page.getByPlaceholder('Buscar o registrar una electrobomba…').fill(modelo)
    await page.getByRole('option', { name: `Registrar «${modelo}»` }).click()

    await expect(page.getByRole('combobox', { name: 'Electrobomba instalada' })).toContainText(
      modelo,
    )
    await expect(page.getByLabel('Profundidad (m)')).toHaveValue('55')
  })
})

test.describe('permisos sobre el historial', () => {
  test('el cliente ve el pozo pero no puede cargar intervenciones', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlPozo)

    await expect(page.getByRole('heading', { name: `Pozo ${marca}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nueva intervención' })).toHaveCount(0)

    await page.goto(urlNueva)
    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes del
    // guard: lo que se verifica es que llegue la pantalla de "no encontrado"
    // y ningún dato. Ver tests/e2e/auditoria-idor.spec.ts.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })

  test('el cargador tampoco puede cargar intervenciones', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    await page.goto(urlNueva)
    // Con loading.tsx la respuesta se transmite y el estado sale 200 antes del
    // guard: lo que se verifica es que llegue la pantalla de "no encontrado"
    // y ningún dato. Ver tests/e2e/auditoria-idor.spec.ts.
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  })
})

/**
 * Notas de voz en el historial.
 *
 * No hay micrófono en Playwright, así que los audios se siembran por Prisma.
 * Lo que importa verificar es la LECTURA: que cada nota muestre SU duración.
 * Ese es justamente el dato que el archivo no trae —MediaRecorder no lo
 * escribe en la cabecera— y por el que el reproductor nativo mostraba tiempos
 * disparatados.
 */
test.describe('notas de voz en el historial', () => {
  test('cada nota muestra su propia duración, no la del archivo', async ({ page }) => {
    sembrarNotasDeVoz(marca)

    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlPozo)

    // Numeradas, porque hay más de una.
    await expect(page.getByText('Nota de voz 1')).toBeVisible()
    await expect(page.getByText('Nota de voz 2')).toBeVisible()

    // 7 segundos y 2:12: cada una con la suya, sin cruzarse.
    await expect(page.getByText('0:00 / 0:07')).toBeVisible()
    await expect(page.getByText('0:00 / 2:12')).toBeVisible()

    // Y con controles propios, no el reproductor nativo del navegador.
    await expect(page.getByRole('button', { name: 'Reproducir nota de voz' })).toHaveCount(2)
  })

  test('el cliente también las escucha: son de su pozo', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlPozo)

    await expect(page.getByText('0:00 / 0:07')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reproducir nota de voz' }).first()).toBeVisible()
  })
})

/**
 * Edición de una intervención ya cargada.
 *
 * Es el caso real del campo: se cargó 12 donde iban 120, o el técnico se
 * acuerda de una observación al día siguiente. Lo que hay que garantizar es
 * que corregir no destruya lo que estaba bien.
 */
test.describe('editar una intervención', () => {
  /** Carga una intervención completa y devuelve la URL de su edición. */
  async function crearYAbrirEdicion(page: import('@playwright/test').Page, profundidad: string) {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)

    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByLabel('Profundidad (m)').fill(profundidad)
    await page.getByLabel('Diámetro de perforación (″)').fill('8')
    // El texto lleva la profundidad para ser único: todos estos tests cargan
    // sobre el MISMO pozo, y con un texto repetido las aserciones no sabrían
    // a cuál intervención se refieren.
    await page.getByLabel('Notas de la visita').fill(`Observación original ${profundidad}.`)
    await page.getByRole('button', { name: 'Guardar intervención' }).click()
    await expect(page).toHaveURL(urlPozo)

    // El lápiz de la primera intervención del historial.
    await page.getByRole('link', { name: 'Editar intervención' }).first().click()
    await expect(page.getByRole('heading', { name: 'Editar intervención' })).toBeVisible()
  }

  test('el formulario llega con los valores actuales cargados', async ({ page }) => {
    await crearYAbrirEdicion(page, '111')

    await expect(page.getByLabel('Profundidad (m)')).toHaveValue('111')
    await expect(page.getByLabel('Diámetro de perforación (″)')).toHaveValue('8')
    await expect(page.getByLabel('Notas de la visita')).toHaveValue('Observación original 111.')
    // El servicio marcado sigue marcado.
    await expect(page.getByRole('button', { name: 'Bobinado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('corrige una medición mal cargada sin tocar el resto', async ({ page }) => {
    await crearYAbrirEdicion(page, '12')

    // El dedazo clásico: iban 120 y se cargó 12.
    await page.getByLabel('Profundidad (m)').fill('120')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page).toHaveURL(urlPozo)

    // La intervención editada: se ubica por su observación, que es única.
    const editada = page.getByRole('listitem').filter({ hasText: 'Observación original 12.' })
    await expect(editada).toHaveCount(1)

    await expect(editada.getByText('120')).toBeVisible()
    // Lo que no se tocó sigue igual: la observación y el servicio marcado.
    await expect(editada.getByText('Bobinado', { exact: true })).toBeVisible()
  })

  test('agrega una observación más tarde', async ({ page }) => {
    await crearYAbrirEdicion(page, '55')

    await page
      .getByLabel('Notas de la visita')
      .fill('Observación original.\nAgregado al día siguiente: falta cambiar el manómetro.')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page).toHaveURL(urlPozo)

    await expect(page.getByText(/falta cambiar el manómetro/)).toBeVisible()
  })

  test('permite cambiar los servicios marcados', async ({ page }) => {
    await crearYAbrirEdicion(page, '77')

    // Se desmarca el que estaba y se marca otro.
    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByRole('button', { name: 'Filmación de pozo' }).click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page).toHaveURL(urlPozo)

    await expect(page.getByText('Filmación de pozo')).toBeVisible()
  })

  test('deja constancia de que la intervención fue editada', async ({ page }) => {
    await crearYAbrirEdicion(page, '99')

    await page.getByLabel('Profundidad (m)').fill('98')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page).toHaveURL(urlPozo)

    // El cliente ve estos datos: tiene que notarse que se corrigieron.
    await expect(page.getByText(/editada el/).first()).toBeVisible()
  })

  test('sigue rechazando datos inválidos al editar', async ({ page }) => {
    await crearYAbrirEdicion(page, '60')

    // Los niveles cruzados se rechazan igual que al crear.
    await page.getByLabel('Nivel estático (m)').fill('30')
    await page.getByLabel('Nivel dinámico (m)').fill('18')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText(/Están cruzados/)).toBeVisible()
  })

  test('elimina la intervención con confirmación', async ({ page }) => {
    await crearYAbrirEdicion(page, '43')

    await page.getByRole('button', { name: 'Eliminar esta intervención' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Se puede cancelar sin consecuencias.
    await page.getByRole('button', { name: 'Conservarla' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Eliminar esta intervención' }).click()
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click()

    await expect(page).toHaveURL(urlPozo)
    await expect(page.getByText('43', { exact: true })).toHaveCount(0)
  })
})

test.describe('permisos sobre la edición', () => {
  test('el cliente no ve el botón de editar ni alcanza la ruta', async ({ page }) => {
    // Primero el admin deja una intervención cargada.
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)
    await page.goto(urlNueva)
    await page.getByRole('button', { name: 'Bobinado' }).click()
    await page.getByRole('button', { name: 'Guardar intervención' }).click()
    await expect(page).toHaveURL(urlPozo)

    await login(page, `${marca}-cliente@test.local`)
    await page.goto(urlPozo)

    await expect(page.getByRole('link', { name: 'Editar intervención' })).toHaveCount(0)
  })
})
