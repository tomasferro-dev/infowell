import { expect, test } from '@playwright/test'

import { limpiarDatos, login, marca, montarDatos, type DatosTest } from './helpers'

/**
 * AUDITORÍA IDOR — barrido sistemático de todas las rutas.
 *
 * Un IDOR (Insecure Direct Object Reference) es pedir por URL el id de algo que
 * no te corresponde. Es la forma más común de filtrar datos entre clientes, y
 * el requisito más crítico de este proyecto es justamente que no pase.
 *
 * Este archivo enumera TODA ruta que reciba un id y la prueba con un id ajeno,
 * con cada rol. Cuando se agregue una ruta nueva con parámetros, va acá.
 *
 * POR QUÉ SE VERIFICA EL CONTENIDO Y NO EL CÓDIGO HTTP:
 * las páginas tienen `loading.tsx`, y eso hace que Next empiece a transmitir
 * la respuesta —con estado 200— antes de terminar de renderizarlas. Cuando
 * después corre el guard y llama a notFound(), la cabecera ya salió.
 *
 * Es un compromiso consciente: se eligió tener indicadores de carga en toda
 * navegación. Lo que importa se conserva y se prueba acá — el usuario recibe
 * la pantalla de "no encontrado", NUNCA el dato, y esa pantalla es idéntica
 * para algo ajeno y para algo inexistente, así que sigue sin poder deducir
 * qué existe. De hecho verificar el contenido es más fuerte que verificar el
 * número: un 404 no demuestra que no se haya filtrado nada.
 *
 * Los endpoints de /api NO transmiten, así que ahí sí se verifica el estado.
 */

/** Navega y exige la pantalla de "no encontrado", sin rastro del dato. */
async function exigirNoEncontrado(
  page: import('@playwright/test').Page,
  ruta: string,
  textosProhibidos: string[] = [],
) {
  await page.goto(ruta)

  await expect(
    page.getByRole('heading', { name: 'No encontramos esta página' }),
    `debería mostrar "no encontrado": ${ruta}`,
  ).toBeVisible()

  for (const texto of textosProhibidos) {
    await expect(page.getByText(texto), `no debe filtrar "${texto}" en ${ruta}`).toHaveCount(0)
  }
}

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

/** Rutas de página que reciben ids. Se prueban con los de la finca AJENA. */
function rutasDeFincaAjena(d: DatosTest) {
  const f = d.fincaAjenaId
  const p = d.pozoAjenoId

  return [
    `/fincas/${f}`,
    `/fincas/${f}/editar`,
    `/fincas/${f}/pozos/nuevo`,
    `/fincas/${f}/pozos/${p}`,
    `/fincas/${f}/pozos/${p}/editar`,
    `/fincas/${f}/pozos/${p}/intervencion/nueva`,
    // Editar con un id inventado: no debe filtrar nada de la finca ajena.
    `/fincas/${f}/pozos/${p}/intervencion/no-existe/editar`,
    `/fincas/${f}/remitos`,
    `/fincas/${f}/remitos/nuevo`,
  ]
}

/** Rutas reservadas al administrador. */
const RUTAS_ADMIN = [
  '/admin/usuarios',
  '/admin/usuarios/nuevo',
  '/admin/servicios',
  '/admin/bombas',
]

test.describe('el CLIENTE no alcanza nada ajeno', () => {
  test('ninguna ruta de una finca ajena responde algo distinto de 404', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    for (const ruta of rutasDeFincaAjena(datos)) {
      // Además de la pantalla correcta: ni el nombre de la finca ajena ni el
      // de su pozo pueden aparecer en ningún lado.
      await exigirNoEncontrado(page, ruta, [`${marca} Finca Ajena`, 'Pozo secreto'])
    }
  })

  test('ninguna ruta de administración le responde', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    for (const ruta of RUTAS_ADMIN) {
      await exigirNoEncontrado(page, ruta)
    }
  })

  test('tampoco escribe en su PROPIA finca: es de solo lectura', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    const propias = [
      `/fincas/${datos.fincaPropiaId}/editar`,
      `/fincas/${datos.fincaPropiaId}/pozos/nuevo`,
      `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}/editar`,
      `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}/intervencion/nueva`,
      `/fincas/${datos.fincaPropiaId}/remitos/nuevo`,
    ]

    for (const ruta of propias) {
      await exigirNoEncontrado(page, ruta)
    }
  })
})

test.describe('el CARGADOR solo escribe remitos', () => {
  test('ninguna ruta de una finca ajena le responde', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    for (const ruta of rutasDeFincaAjena(datos)) {
      await exigirNoEncontrado(page, ruta, [`${marca} Finca Ajena`, 'Pozo secreto'])
    }
  })

  test('ninguna ruta de administración le responde', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    for (const ruta of RUTAS_ADMIN) {
      await exigirNoEncontrado(page, ruta)
    }
  })

  test('en su propia finca puede remitos, pero no pozos ni intervenciones', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const prohibidas = [
      `/fincas/${datos.fincaPropiaId}/editar`,
      `/fincas/${datos.fincaPropiaId}/pozos/nuevo`,
      `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}/editar`,
      `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoPropioId}/intervencion/nueva`,
    ]

    for (const ruta of prohibidas) {
      await exigirNoEncontrado(page, ruta)
    }

    // Y lo que SÍ le corresponde sigue funcionando.
    await page.goto(`/fincas/${datos.fincaPropiaId}/remitos/nuevo`)
    await expect(page.getByRole('heading', { name: 'Cargar remito' })).toBeVisible()
  })
})

/**
 * El caso menos obvio: mezclar un id propio con uno ajeno. El guard mira el
 * farmId, así que si una query no filtrara también por él, un pozo ajeno se
 * colaría "dentro" de una finca propia.
 */
test.describe('ids cruzados entre fincas', () => {
  test('finca propia + pozo ajeno no devuelve el pozo ajeno', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    await exigirNoEncontrado(page, `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoAjenoId}`, [
      'Pozo secreto',
    ])
  })

  test('el admin tampoco ve un pozo bajo una finca que no es la suya', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    // El admin ve todo, pero el pozo tiene que estar en la finca pedida:
    // si no, la URL estaría mintiendo sobre a quién pertenece.
    await exigirNoEncontrado(page, `/fincas/${datos.fincaPropiaId}/pozos/${datos.pozoAjenoId}`, [
      'Pozo secreto',
    ])
  })
})

test.describe('endpoints de archivos', () => {
  test('el cliente no obtiene firma de subida para ninguna finca', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    for (const farmId of [datos.fincaPropiaId, datos.fincaAjenaId]) {
      for (const tipo of ['nota-voz', 'remito'] as const) {
        const r = await page.request.post('/api/uploads/sign', {
          data: { tipo, farmId, recursoId: 'x', mimeType: 'image/jpeg' },
        })
        expect(r.status(), `${tipo} en ${farmId}`).toBe(404)
      }
    }
  })

  test('el cargador no obtiene firma para una finca ajena', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)

    const r = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'remito',
        farmId: datos.fincaAjenaId,
        recursoId: 'x',
        mimeType: 'image/jpeg',
      },
    })

    expect(r.status()).toBe(404)
  })

  test('no se puede leer un archivo de una finca ajena por ningún bucket', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)

    for (const bucket of ['remitos', 'notas-voz']) {
      const r = await page.request.get(
        `/api/files/${bucket}/${datos.fincaAjenaId}/algo/archivo.jpg`,
        { maxRedirects: 0 },
      )
      expect(r.status(), bucket).toBe(404)
    }
  })

  test('un bucket inventado no existe', async ({ page }) => {
    await login(page, EMAIL_ADMIN!, CLAVE_ADMIN!)

    const r = await page.request.get(
      `/api/files/inventado/${datos.fincaPropiaId}/algo/archivo.jpg`,
      { maxRedirects: 0 },
    )
    expect(r.status()).toBe(404)
  })
})

test.describe('el mapa es la vista más agregada de todas', () => {
  /**
   * El mapa no tiene una ruta "ajena" que pedir: es UNA sola ruta que junta
   * todas las fincas del actor. El riesgo no es entrar donde no corresponde
   * sino que la consulta traiga de más, y como las coordenadas viajan enteras
   * al navegador, no alcanza con que la vista no las dibuje.
   */
  test('el CLIENTE no recibe ni un dato de la finca ajena', async ({ page }) => {
    await login(page, `${marca}-cliente@test.local`)
    await page.goto('/mapa')

    const html = await page.content()
    expect(html, 'el id de la finca ajena no puede viajar al navegador').not.toContain(
      datos.fincaAjenaId,
    )
    expect(html, 'ni el de su pozo').not.toContain(datos.pozoAjenoId)
    expect(html).not.toContain(`${marca} Finca Ajena`)
    expect(html).not.toContain('Pozo secreto')
  })

  test('el CARGADOR tampoco', async ({ page }) => {
    await login(page, `${marca}-cargador@test.local`)
    await page.goto('/mapa')

    const html = await page.content()
    expect(html).not.toContain(datos.fincaAjenaId)
    expect(html).not.toContain(datos.pozoAjenoId)
  })
})

test.describe('sin sesión no se entra a ningún lado', () => {
  test('toda ruta de la app redirige al login', async ({ page }) => {
    const rutas = [
      '/',
      '/fincas',
      '/mapa',
      `/fincas/${datos.fincaPropiaId}`,
      `/fincas/${datos.fincaPropiaId}/remitos`,
      '/admin/usuarios',
      '/admin/servicios',
    ]

    for (const ruta of rutas) {
      await page.goto(ruta)
      await expect(page, `debería ir al login: ${ruta}`).toHaveURL(/\/login/)
    }
  })

  test('los endpoints de archivos responden 401, no datos', async ({ page }) => {
    const firma = await page.request.post('/api/uploads/sign', {
      data: {
        tipo: 'remito',
        farmId: datos.fincaPropiaId,
        recursoId: 'x',
        mimeType: 'image/jpeg',
      },
    })
    expect(firma.status()).toBe(401)

    const archivo = await page.request.get(
      `/api/files/remitos/${datos.fincaPropiaId}/algo/x.jpg`,
      { maxRedirects: 0 },
    )
    expect(archivo.status()).toBe(401)
  })
})
