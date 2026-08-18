import 'dotenv/config'

import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { PrismaClient } from '../src/generated/prisma/client'
import { toSlug } from '../src/lib/slug'

/**
 * Carga un juego de datos de demostración realista.
 *
 * Para qué sirve: poder mostrar la app funcionando —con historial, evolución
 * de niveles y remitos— sin esperar a que la empresa cargue meses de trabajo.
 *
 * Es DESTRUCTIVO y reproducible: borra fincas, pozos, intervenciones, remitos
 * y usuarios que no sean ADMIN, y vuelve a crear todo igual. Conserva el
 * administrador y los 13 servicios del catálogo base.
 *
 *   npm run db:demo
 */

const conexion = process.env.DIRECT_URL
if (!conexion) throw new Error('Falta DIRECT_URL')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conexion }) })

const HOY = new Date()

/** Fecha a N meses atrás. La columna es DATE, así que se normaliza en UTC. */
function hace(meses: number, dia = 12): Date {
  const f = new Date(HOY.getFullYear(), HOY.getMonth() - meses, dia)
  return new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()))
}

// ─────────────────────────────────────────────────────────────
// DATOS
// ─────────────────────────────────────────────────────────────

/**
 * Cuatro fincas de la zona vitivinícola de Mendoza, que es donde trabaja
 * ARENAS. Nombres, CUIT y teléfonos son inventados.
 */
const FINCAS = [
  {
    name: 'Finca La Escondida',
    taxId: '30712345671',
    city: 'Luján de Cuyo',
    province: 'Mendoza',
    address: 'Ruta Provincial 15, km 24',
    contactName: 'Ramiro Sosa',
    contactPhone: '261 555 1042',
    contactEmail: 'ramiro@laescondida.com.ar',
    notes: 'Riego por goteo en los tres cuadros. Acceso por el portón sur.',
    pozos: [
      { name: 'Pozo N° 1 - Sector Norte', perforadoHaceMeses: 26 },
      { name: 'Pozo N° 2 - Cuadro Malbec', perforadoHaceMeses: 15 },
    ],
  },
  {
    name: 'Bodega Alto Cerro',
    taxId: '33693450239',
    city: 'Tunuyán',
    province: 'Mendoza',
    address: 'Camino a Los Chacayes s/n',
    contactName: 'Valeria Ibáñez',
    contactPhone: '261 555 3388',
    contactEmail: 'produccion@altocerro.com.ar',
    notes: 'Coordinar las visitas con producción. No entrar en cosecha.',
    pozos: [
      // Sin fecha: es un pozo heredado y nadie sabe cuando se hizo.
      { name: 'Pozo N° 1 - Casco' },
      { name: 'Pozo N° 2 - Finca Alta', perforadoHaceMeses: 9 },
      { name: 'Pozo N° 3 - Reserva', perforadoHaceMeses: 54 },
    ],
  },
  {
    name: 'Finca Los Álamos',
    city: 'San Rafael',
    province: 'Mendoza',
    address: 'Calle Pescara 2200',
    contactName: 'Julio Peralta',
    contactPhone: '260 555 7719',
    pozos: [{ name: 'Pozo N° 1 - Cabecera', perforadoHaceMeses: 72 }],
  },
  {
    name: 'Establecimiento El Retamo',
    city: 'Maipú',
    province: 'Mendoza',
    contactName: 'Marta Quiroga',
    contactPhone: '261 555 9004',
    notes: 'Pozo viejo, de los años noventa. Los papeles están en la administración.',
    pozos: [{ name: 'Pozo N° 1 - Único', perforadoHaceMeses: 340 }],
  },
]

/** Electrobombas reales del rubro, para que el catálogo no quede vacío. */
const BOMBAS = [
  { label: 'Grundfos SP 46-7', brand: 'Grundfos', model: 'SP 46-7', horsePower: 15 },
  { label: 'Grundfos SP 17-13', brand: 'Grundfos', model: 'SP 17-13', horsePower: 10 },
  { label: 'Franklin Electric 6 pulgadas 20 HP', brand: 'Franklin Electric', horsePower: 20 },
  { label: 'Pedrollo 6SR 27/7', brand: 'Pedrollo', model: '6SR 27/7', horsePower: 7.5 },
  { label: 'Motorarg BS 4 pulgadas 3 HP', brand: 'Motorarg', horsePower: 3 },
]

type Visita = {
  meses: number
  servicios: string[]
  depthM?: number
  pumpDepthM?: number
  staticLevelM?: number
  dynamicLevelM?: number
  boreDiameterIn?: number
  flowRateM3H?: number
  bomba?: string
  obs?: string
}

/**
 * Historial de cada pozo.
 *
 * Los niveles bajan de a poco entre visitas: es lo que pasa de verdad en los
 * acuíferos de Mendoza, y hace que el gráfico de evolución muestre algo con
 * sentido en vez de una línea plana. El caudal acompaña esa caída.
 */
const HISTORIALES: Record<string, Visita[]> = {
  // El pozo de referencia: cinco visitas, evolución clara y cambio de bomba.
  'Pozo N° 1 - Sector Norte': [
    {
      meses: 26,
      servicios: ['Perforación de pozo', 'Desarrollo de perforación'],
      depthM: 148,
      boreDiameterIn: 10,
      staticLevelM: 38,
      dynamicLevelM: 61,
      flowRateM3H: 62,
      pumpDepthM: 96,
      bomba: 'Grundfos SP 46-7',
      obs: 'Perforación terminada a 148 m. Se entubó en acero y se desarrolló hasta agua limpia. Ensayo de bombeo de 8 horas sin caída del caudal.',
    },
    {
      meses: 19,
      servicios: ['Mantenimiento y rehabilitación de pozo', 'Limpieza de perforación'],
      depthM: 148,
      boreDiameterIn: 10,
      staticLevelM: 40.5,
      dynamicLevelM: 65,
      flowRateM3H: 58,
      pumpDepthM: 96,
      obs: 'Limpieza anual. Se retiró arena fina del fondo. El nivel estático bajó dos metros y medio respecto de la puesta en marcha.',
    },
    {
      meses: 12,
      servicios: ['Filmación de pozo'],
      depthM: 146,
      boreDiameterIn: 10,
      staticLevelM: 43,
      dynamicLevelM: 69,
      flowRateM3H: 54,
      pumpDepthM: 96,
      obs: 'Filmación hasta los 140 m. Se ve incrustación leve en los filtros entre 110 y 125 m. Se recomienda rehabilitación química en la próxima campaña.',
    },
    {
      meses: 6,
      servicios: [
        'Extracción de electrobomba',
        'Colocación de electrobomba',
        'Reparación de electrobomba',
      ],
      depthM: 146,
      boreDiameterIn: 10,
      staticLevelM: 45.5,
      dynamicLevelM: 74,
      flowRateM3H: 51,
      pumpDepthM: 108,
      bomba: 'Grundfos SP 46-7',
      obs: 'Se bajó la bomba doce metros por la caída del nivel dinámico. Se reemplazaron los rodamientos y el cable sumergible en el mismo trabajo.',
    },
    {
      meses: 1,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 146,
      boreDiameterIn: 10,
      staticLevelM: 47,
      dynamicLevelM: 77,
      flowRateM3H: 49,
      pumpDepthM: 108,
      obs: 'Control de rutina. El abatimiento se mantiene estable en 30 m. Conviene repetir la filmación antes del verano.',
    },
  ],

  'Pozo N° 2 - Cuadro Malbec': [
    {
      meses: 15,
      servicios: ['Perforación de pozo', 'Colocación de electrobomba'],
      depthM: 92,
      boreDiameterIn: 8,
      staticLevelM: 31,
      dynamicLevelM: 48,
      flowRateM3H: 34,
      pumpDepthM: 66,
      bomba: 'Grundfos SP 17-13',
      obs: 'Pozo nuevo para el cuadro de Malbec. Se instaló una bomba de 10 HP.',
    },
    {
      meses: 8,
      servicios: ['Limpieza de perforación'],
      depthM: 92,
      boreDiameterIn: 8,
      staticLevelM: 32.5,
      dynamicLevelM: 51,
      flowRateM3H: 32,
      pumpDepthM: 66,
    },
    {
      meses: 2,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 92,
      boreDiameterIn: 8,
      staticLevelM: 34,
      dynamicLevelM: 54,
      flowRateM3H: 30,
      pumpDepthM: 66,
      obs: 'Se ajustó el tablero y se cambió el manómetro. Todo en orden.',
    },
  ],

  'Pozo N° 1 - Casco': [
    {
      meses: 22,
      servicios: ['Mantenimiento y rehabilitación de pozo', 'Bobinado'],
      depthM: 120,
      boreDiameterIn: 10,
      staticLevelM: 26,
      dynamicLevelM: 44,
      flowRateM3H: 71,
      pumpDepthM: 84,
      bomba: 'Franklin Electric 6 pulgadas 20 HP',
      obs: 'Bobinado del motor por quemadura de fase. Se probó en banco antes de bajarlo.',
    },
    {
      meses: 14,
      servicios: ['Limpieza de perforación', 'Desarrollo de perforación'],
      depthM: 120,
      boreDiameterIn: 10,
      staticLevelM: 27.5,
      dynamicLevelM: 47,
      flowRateM3H: 68,
      pumpDepthM: 84,
    },
    {
      meses: 5,
      servicios: ['Filmación de pozo', 'Estudio geológico'],
      depthM: 118,
      boreDiameterIn: 10,
      staticLevelM: 29,
      dynamicLevelM: 50,
      flowRateM3H: 65,
      pumpDepthM: 84,
      obs: 'Estudio geológico para evaluar una segunda perforación en el sector alto. El perfil muestra buen acuífero entre 90 y 115 m.',
    },
    {
      meses: 1,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 118,
      boreDiameterIn: 10,
      staticLevelM: 30,
      dynamicLevelM: 52,
      flowRateM3H: 63,
      pumpDepthM: 84,
    },
  ],

  'Pozo N° 2 - Finca Alta': [
    {
      meses: 9,
      servicios: [
        'Perforación de pozo',
        'Desarrollo de perforación',
        'Colocación de electrobomba',
      ],
      depthM: 165,
      boreDiameterIn: 12,
      staticLevelM: 52,
      dynamicLevelM: 83,
      flowRateM3H: 88,
      pumpDepthM: 122,
      bomba: 'Franklin Electric 6 pulgadas 20 HP',
      obs: 'Perforación profunda para el sector alto. Excelente caudal, el mejor de la finca.',
    },
    {
      meses: 4,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 165,
      boreDiameterIn: 12,
      staticLevelM: 53.5,
      dynamicLevelM: 86,
      flowRateM3H: 85,
      pumpDepthM: 122,
    },
    {
      meses: 1,
      servicios: ['Limpieza de perforación'],
      depthM: 165,
      boreDiameterIn: 12,
      staticLevelM: 55,
      dynamicLevelM: 89,
      flowRateM3H: 83,
      pumpDepthM: 122,
      obs: 'Limpieza preventiva antes de la temporada de riego.',
    },
  ],

  'Pozo N° 3 - Reserva': [
    {
      meses: 7,
      servicios: ['Filmación de pozo'],
      depthM: 74,
      boreDiameterIn: 8,
      staticLevelM: 24,
      dynamicLevelM: 39,
      obs: 'Pozo de reserva, sin bomba instalada. La filmación muestra el entubado en buen estado. Se puede poner en servicio cuando haga falta.',
    },
    {
      meses: 2,
      servicios: ['Limpieza de perforación'],
      depthM: 74,
      boreDiameterIn: 8,
      staticLevelM: 25,
      dynamicLevelM: 40,
    },
  ],

  'Pozo N° 1 - Cabecera': [
    {
      meses: 18,
      servicios: ['Mantenimiento y rehabilitación de pozo', 'Colocación de electrobomba'],
      depthM: 68,
      boreDiameterIn: 6,
      staticLevelM: 18,
      dynamicLevelM: 29,
      flowRateM3H: 22,
      pumpDepthM: 48,
      bomba: 'Pedrollo 6SR 27/7',
      obs: 'Se cambió la bomba vieja por una Pedrollo de 7,5 HP.',
    },
    {
      meses: 10,
      servicios: ['Reparación de electrobomba'],
      depthM: 68,
      boreDiameterIn: 6,
      staticLevelM: 19,
      dynamicLevelM: 31,
      flowRateM3H: 21,
      pumpDepthM: 48,
      obs: 'Se reparó una pérdida en la columna de impulsión.',
    },
    {
      meses: 3,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 68,
      boreDiameterIn: 6,
      staticLevelM: 20,
      dynamicLevelM: 33,
      flowRateM3H: 20,
      pumpDepthM: 48,
    },
  ],

  'Pozo N° 1 - Único': [
    {
      meses: 20,
      servicios: ['Pesca de electrobomba', 'Colocación de electrobomba'],
      depthM: 55,
      boreDiameterIn: 6,
      staticLevelM: 14,
      dynamicLevelM: 26,
      flowRateM3H: 15,
      pumpDepthM: 40,
      bomba: 'Motorarg BS 4 pulgadas 3 HP',
      obs: 'Se pescó la bomba anterior, que había quedado suelta en el pozo. Se instaló una nueva de 3 HP.',
    },
    {
      meses: 11,
      servicios: ['Limpieza de perforación'],
      depthM: 55,
      boreDiameterIn: 6,
      staticLevelM: 15,
      dynamicLevelM: 28,
      flowRateM3H: 14,
      pumpDepthM: 40,
    },
    {
      meses: 4,
      servicios: ['Mantenimiento y rehabilitación de pozo'],
      depthM: 55,
      boreDiameterIn: 6,
      staticLevelM: 15.5,
      dynamicLevelM: 29,
      flowRateM3H: 14,
      pumpDepthM: 40,
      obs: 'Pozo chico pero estable. Alcanza para la superficie que riega.',
    },
  ],
}

/** Remitos por finca. */
const REMITOS: Record<
  string,
  { meses: number; monto: number; numero: string; detalle?: string }[]
> = {
  'Finca La Escondida': [
    {
      meses: 6,
      monto: 1850000,
      numero: '0001-00004312',
      detalle: 'Extracción, reparación y recolocación de electrobomba.',
    },
    {
      meses: 1,
      monto: 320000,
      numero: '0001-00004980',
      detalle: 'Mantenimiento y control de niveles.',
    },
  ],
  'Bodega Alto Cerro': [
    {
      meses: 9,
      monto: 7400000,
      numero: '0001-00004115',
      detalle: 'Perforación de 165 m, entubado y desarrollo.',
    },
    {
      meses: 5,
      monto: 640000,
      numero: '0001-00004501',
      detalle: 'Filmación de pozo y estudio geológico.',
    },
    { meses: 1, monto: 285000, numero: '0001-00004977', detalle: 'Limpieza de perforación.' },
  ],
  'Finca Los Álamos': [{ meses: 3, monto: 410500, numero: '0001-00004766' }],
  'Establecimiento El Retamo': [
    { meses: 4, monto: 268000, numero: '0001-00004690', detalle: 'Mantenimiento general.' },
  ],
}

// ─────────────────────────────────────────────────────────────
// FOTO DEL REMITO
// ─────────────────────────────────────────────────────────────

/**
 * Genera una foto de remito de demostración.
 *
 * Sin foto, la galería y el visor quedan vacíos y no se puede mostrar esa
 * parte de la app. Lleva la leyenda DEMOSTRACIÓN bien visible: no pretende
 * pasar por un comprobante real.
 */
async function imagenDeRemito(numero: string, monto: string, fecha: string): Promise<Buffer> {
  const lineas = [560, 610, 660, 710]
    .map((y) => `<line x1="80" y1="${y}" x2="820" y2="${y}" stroke="#e8e5df" stroke-width="2"/>`)
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
    <rect width="900" height="1200" fill="#f3f1ec"/>
    <rect x="40" y="40" width="820" height="1120" fill="#ffffff" stroke="#d8d4cc" stroke-width="2"/>
    <rect x="40" y="40" width="820" height="14" fill="#ec1f25"/>
    <text x="80" y="130" font-family="sans-serif" font-size="40" font-weight="bold" fill="#383a3c">ARENAS PERFORACIONES</text>
    <text x="80" y="176" font-family="sans-serif" font-size="26" fill="#6b6b6b">Remito de servicios</text>
    <line x1="80" y1="210" x2="820" y2="210" stroke="#d8d4cc" stroke-width="2"/>
    <text x="80" y="270" font-family="sans-serif" font-size="24" fill="#6b6b6b">Numero de remito</text>
    <text x="80" y="312" font-family="sans-serif" font-size="34" fill="#383a3c">${numero}</text>
    <text x="80" y="380" font-family="sans-serif" font-size="24" fill="#6b6b6b">Fecha</text>
    <text x="80" y="422" font-family="sans-serif" font-size="32" fill="#383a3c">${fecha}</text>
    <line x1="80" y1="480" x2="820" y2="480" stroke="#d8d4cc" stroke-width="2"/>
    ${lineas}
    <text x="80" y="830" font-family="sans-serif" font-size="24" fill="#6b6b6b">TOTAL</text>
    <text x="80" y="890" font-family="sans-serif" font-size="50" font-weight="bold" fill="#383a3c">${monto}</text>
    <rect x="80" y="960" width="300" height="4" fill="#383a3c"/>
    <text x="80" y="1000" font-family="sans-serif" font-size="22" fill="#6b6b6b">Firma y aclaracion</text>
    <text x="80" y="1120" font-family="sans-serif" font-size="20" fill="#a8a49c">DEMOSTRACION - imagen generada para pruebas</text>
  </svg>`

  return sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer()
}

/** Sube un archivo a Storage con la clave de servicio. */
async function subirAStorage(bucket: string, ruta: string, contenido: Buffer) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !clave) throw new Error('Faltan las variables de Supabase Storage')

  const supabase = createClient(url, clave, { auth: { persistSession: false } })
  const { error } = await supabase.storage
    .from(bucket)
    .upload(ruta, contenido, { contentType: 'image/jpeg', upsert: true })

  if (error) throw new Error(`No se pudo subir ${ruta}: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────
// CARGA
// ─────────────────────────────────────────────────────────────

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  })
  if (!admin) throw new Error('No hay usuario ADMIN. Corré primero: npm run db:seed')

  console.log('Limpiando datos anteriores…')
  // Borrar las fincas arrastra en cascada pozos, intervenciones, mediciones,
  // observaciones, notas de voz y remitos.
  const { count: fincasBorradas } = await prisma.farm.deleteMany({})
  const { count: usuariosBorrados } = await prisma.user.deleteMany({
    where: { role: { not: 'ADMIN' } },
  })
  // Basura de catálogo que dejaron los tests: solo lo que nadie referencia.
  await prisma.pump.deleteMany({ where: { readings: { none: {} } } })
  await prisma.serviceType.deleteMany({
    where: { isSystem: false, interventions: { none: {} } },
  })
  console.log(`  ${fincasBorradas} fincas y ${usuariosBorrados} usuarios eliminados`)

  console.log('Cargando electrobombas…')
  const bombaPorNombre = new Map<string, string>()
  for (const b of BOMBAS) {
    const creada = await prisma.pump.upsert({
      where: { normalizedLabel: toSlug(b.label) },
      update: {},
      create: { ...b, normalizedLabel: toSlug(b.label), isSystem: false },
      select: { id: true, label: true },
    })
    bombaPorNombre.set(creada.label, creada.id)
  }

  const servicios = await prisma.serviceType.findMany({ select: { id: true, name: true } })
  const servicioPorNombre = new Map(servicios.map((s) => [s.name, s.id]))

  console.log('Cargando fincas, pozos e intervenciones…')
  let totalPozos = 0
  let totalIntervenciones = 0
  let totalRemitos = 0

  for (const finca of FINCAS) {
    const { pozos, ...datosFinca } = finca

    const creada = await prisma.farm.create({
      data: {
        ...datosFinca,
        wells: {
          create: pozos.map((p) => ({
            name: p.name,
            drilledAt: p.perforadoHaceMeses != null ? hace(p.perforadoHaceMeses, 20) : undefined,
          })),
        },
      },
      select: { id: true, name: true, wells: { select: { id: true, name: true } } },
    })

    totalPozos += creada.wells.length

    for (const pozo of creada.wells) {
      for (const v of HISTORIALES[pozo.name] ?? []) {
        const fecha = hace(v.meses)
        const idsServicios = v.servicios
          .map((n) => servicioPorNombre.get(n))
          .filter((id): id is string => !!id)

        const hayMediciones =
          v.depthM != null || v.staticLevelM != null || v.dynamicLevelM != null || v.bomba != null

        await prisma.intervention.create({
          data: {
            wellId: pozo.id,
            performedAt: fecha,
            createdById: admin.id,
            services: { create: idsServicios.map((serviceTypeId) => ({ serviceTypeId })) },
            ...(hayMediciones
              ? {
                  reading: {
                    create: {
                      wellId: pozo.id,
                      measuredAt: fecha,
                      createdById: admin.id,
                      depthM: v.depthM,
                      pumpDepthM: v.pumpDepthM,
                      staticLevelM: v.staticLevelM,
                      dynamicLevelM: v.dynamicLevelM,
                      boreDiameterIn: v.boreDiameterIn,
                      flowRateM3H: v.flowRateM3H,
                      pumpId: v.bomba ? bombaPorNombre.get(v.bomba) : undefined,
                    },
                  },
                }
              : {}),
            ...(v.obs
              ? { observations: { create: { wellId: pozo.id, body: v.obs, createdById: admin.id } } }
              : {}),
          },
        })

        totalIntervenciones += 1
      }
    }

    for (const r of REMITOS[creada.name] ?? []) {
      const fecha = hace(r.meses, 5)

      const remito = await prisma.receipt.create({
        data: {
          farmId: creada.id,
          issueDate: fecha,
          amount: r.monto,
          number: r.numero,
          description: r.detalle,
          createdById: admin.id,
        },
        select: { id: true },
      })

      const jpeg = await imagenDeRemito(
        r.numero,
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(r.monto),
        new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(fecha),
      )

      const ruta = `${creada.id}/${remito.id}/${randomUUID()}.jpg`
      await subirAStorage('remitos', ruta, jpeg)

      await prisma.receiptPhoto.create({
        data: { receiptId: remito.id, storagePath: ruta, mimeType: 'image/jpeg', sortOrder: 0 },
      })

      totalRemitos += 1
    }
  }

  console.log(
    `  ${FINCAS.length} fincas · ${totalPozos} pozos · ${totalIntervenciones} intervenciones · ${totalRemitos} remitos`,
  )
  console.log(`\nListo. Entrá con el administrador: ${admin.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
