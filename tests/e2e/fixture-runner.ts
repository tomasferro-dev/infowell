import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

import { PrismaClient } from '../../src/generated/prisma/client'

/**
 * Monta y desmonta los datos de prueba de los e2e.
 *
 * Corre como proceso aparte con tsx en lugar de importarse desde el spec: el
 * loader de Playwright compila a CommonJS y el cliente de Prisma 7 es ESM puro
 * (usa import.meta), así que no se pueden cargar en el mismo proceso.
 *
 * Uso:
 *   tsx fixture-runner.ts setup <marca>    → imprime los ids en JSON
 *   tsx fixture-runner.ts teardown <marca>
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
})

const CLAVE_TEST = 'clave-de-prueba-123'

/**
 * Un punto propio para cada corrida, derivado de la marca.
 *
 * Fijarlo daría el mismo lugar para todos los workers, y con cuatro corriendo
 * en paralelo quedan cuatro pines exactamente encima del otro: el de arriba
 * tapa a los demás y ningún test puede tocar el suyo. Separarlos es lo que
 * hace que el mapa sea testeable en paralelo.
 */
function puntoDeLaCorrida(marca: string) {
  let h = 0
  for (const c of marca) h = (h * 131 + c.charCodeAt(0)) >>> 0

  // Los pasos son de 0.03° (~3 km) y los módulos son primos: dos marcas
  // consecutivas —que difieren en un dígito del reloj— caían en celdas
  // vecinas y, al ver todo el mapa de una, sus pines quedaban encimados.
  return {
    lat: (-33.05 + (h % 97) * 0.03).toFixed(7),
    lon: (-68.9 + (Math.floor(h / 97) % 89) * 0.03).toFixed(7),
  }
}

async function setup(marca: string) {
  const passwordHash = await bcrypt.hash(CLAVE_TEST, 10)
  const punto = puntoDeLaCorrida(marca)

  // La medición necesita un autor y el admin del seed siempre está.
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  const fincaPropia = await prisma.farm.create({
    data: {
      name: `${marca} Finca Propia`,
      // Un pozo propio listo, ubicado: así cada test es independiente y no
      // depende de que otro lo haya creado antes. Las coordenadas lo ponen en
      // el mapa; sin ellas los tests del mapa terminaban tocando pozos de los
      // datos de demostración, que pueden no estar.
      wells: {
        create: {
          name: `Pozo ${marca}`,
          // El pozo, unos 200 m al noreste del casco.
          latitude: (Number(punto.lat) + 0.002).toFixed(7),
          longitude: (Number(punto.lon) + 0.002).toFixed(7),
        },
      },
      latitude: punto.lat,
      longitude: punto.lon,
    },
    select: { id: true, wells: { select: { id: true } } },
  })

  const fincaAjena = await prisma.farm.create({
    data: {
      name: `${marca} Finca Ajena`,
      // Un pozo en la finca ajena, para probar el acceso directo por URL.
      wells: { create: { name: 'Pozo secreto' } },
    },
    select: { id: true, wells: { select: { id: true } } },
  })

  await prisma.user.create({
    data: {
      email: `${marca}-cliente@test.local`,
      name: 'Test Cliente',
      role: 'CLIENTE',
      emailVerified: new Date(),
      passwordHash,
      memberships: { create: { farmId: fincaPropia.id } },
    },
  })

  // Una medición sobre el pozo propio. Es lo que muestra la ficha del mapa, y
  // sin esto los tests dependían de que hubiera datos demo cargados.
  await prisma.wellStatusReading.create({
    data: {
      wellId: fincaPropia.wells[0]!.id,
      measuredAt: new Date(),
      createdById: admin.id,
      depthM: '118.00',
      staticLevelM: '30.00',
      dynamicLevelM: '52.00',
      flowRateM3H: '63.00',
    },
  })

  await prisma.user.create({
    data: {
      email: `${marca}-cargador@test.local`,
      name: 'Test Cargador',
      role: 'CARGADOR',
      emailVerified: new Date(),
      passwordHash,
      memberships: { create: { farmId: fincaPropia.id } },
    },
  })

  return {
    fincaPropiaId: fincaPropia.id,
    pozoPropioId: fincaPropia.wells[0]!.id,
    fincaAjenaId: fincaAjena.id,
    pozoAjenoId: fincaAjena.wells[0]!.id,
  }
}

/**
 * Crea una intervención con DOS notas de voz de duraciones distintas.
 *
 * Se siembra por Prisma y no manejando el formulario porque no hay micrófono
 * en Playwright. Lo que interesa verificar es la lectura: que cada nota se
 * muestre con SU duración, que es justo lo que el archivo no trae.
 */
async function notasDeVoz(marca: string) {
  const pozo = await prisma.well.findFirstOrThrow({
    where: { name: `Pozo ${marca}` },
    select: { id: true, farmId: true },
  })

  const autor = await prisma.user.findFirstOrThrow({
    where: { email: { contains: marca } },
    select: { id: true },
  })

  const intervencion = await prisma.intervention.create({
    data: {
      wellId: pozo.id,
      performedAt: new Date(),
      createdById: autor.id,
      observations: {
        create: {
          wellId: pozo.id,
          body: 'Visita con dos notas de voz.',
          createdById: autor.id,
          voiceNotes: {
            create: [
              {
                storagePath: `${pozo.farmId}/${pozo.id}/corta.webm`,
                mimeType: 'audio/webm',
                durationSec: 7,
              },
              {
                storagePath: `${pozo.farmId}/${pozo.id}/larga.webm`,
                mimeType: 'audio/webm',
                durationSec: 132,
              },
            ],
          },
        },
      },
    },
    select: { id: true },
  })

  return { intervencionId: intervencion.id, wellId: pozo.id, farmId: pozo.farmId }
}

async function teardown(marca: string) {
  // Borrado real, no baja lógica: son datos de prueba, no historial del cliente.
  //
  // El ORDEN importa: los remitos e intervenciones referencian a su autor
  // (createdById, sin cascade). Primero las fincas — que arrastran en cascada
  // pozos, remitos e intervenciones — y recién después los usuarios.
  await prisma.farm.deleteMany({ where: { name: { contains: marca } } })
  await prisma.user.deleteMany({ where: { email: { contains: marca } } })

  // Los dibujos SUELTOS no cuelgan de ninguna finca, así que la cascada no los
  // alcanza: se borran por su nombre, que lleva la marca de la corrida. Sin
  // esto quedaban para siempre, y el administrador se los encontraba en el
  // mapa — pasó: treinta referencias de prueba desperdigadas.
  await prisma.mapAnnotation.deleteMany({
    where: { farmId: null, label: { contains: marca } },
  })

  return { ok: true }
}

/**
 * Los catálogos son globales: lo que crean los tests queda a la vista del
 * cliente si no se limpia. Solo borra los que ningún registro referencia.
 */
async function teardownCatalogo(marca: string) {
  await prisma.pump.deleteMany({
    where: { label: { contains: marca }, isSystem: false, readings: { none: {} } },
  })
  await prisma.serviceType.deleteMany({
    where: { name: { contains: marca }, isSystem: false, interventions: { none: {} } },
  })
  return { ok: true }
}

/**
 * Devuelve la numeración de pozos a su valor por defecto.
 *
 * El ajuste es GLOBAL y esta base es la misma que usa la app publicada: un
 * test que lo cambie y muera a la mitad se lo dejaría cambiado a la empresa.
 * Por eso el reset corre en afterAll y no depende de que el test termine bien.
 */
async function resetAjustes() {
  await prisma.appSetting.deleteMany({ where: { key: 'numeracion_pozos' } })
  return { ok: true }
}

/** Archiva la finca propia de la corrida, como lo haría el administrador. */
async function archivarFinca(marca: string) {
  const finca = await prisma.farm.findFirstOrThrow({
    where: { name: `${marca} Finca Propia` },
    select: { id: true },
  })

  await prisma.farm.update({
    where: { id: finca.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return { id: finca.id }
}

/**
 * Borra los dibujos de las fincas de la corrida.
 *
 * Los tests de dibujo trabajan sobre la misma finca y tocan las mismas
 * coordenadas de pantalla: si los dibujos se acumulan, un test termina tocando
 * el de otro. Empezar con el mapa limpio es lo que los hace independientes.
 */
async function borrarDibujos(marca: string) {
  const { count } = await prisma.mapAnnotation.deleteMany({
    where: {
      OR: [
        { farm: { name: { contains: marca } } },
        // Los sueltos no tienen finca de la cual colgar: se los ubica por su
        // nombre, que lleva la marca de la corrida.
        { farmId: null, label: { contains: marca } },
      ],
    },
  })

  return { borrados: count }
}

/**
 * Deja la finca de la corrida sin imágenes calzadas.
 *
 * Igual que con los dibujos: los tests de imágenes trabajan sobre la MISMA
 * finca, así que sin esto el segundo ve la del primero y el tercero ve dos.
 * Un test que depende de lo que dejó otro falla por algo que no tenía nada que
 * ver con lo que estaba probando.
 *
 * Borrado DURO y no suave: es limpieza de banco de pruebas, no una acción del
 * usuario. Un borrado suave dejaría las filas contando para el próximo test.
 */
async function borrarImagenes(marca: string) {
  const { count } = await prisma.mapOverlay.deleteMany({
    where: { farm: { name: { contains: marca } } },
  })

  return { borradas: count }
}

async function main() {
  const [comando, marca] = process.argv.slice(2)

  if (!marca) throw new Error('Falta la marca de la corrida')

  const resultado =
    comando === 'setup'
      ? await setup(marca)
      : comando === 'teardown-catalogo'
        ? await teardownCatalogo(marca)
        : comando === 'notas-de-voz'
          ? await notasDeVoz(marca)
          : comando === 'reset-ajustes'
            ? await resetAjustes()
            : comando === 'archivar-finca'
              ? await archivarFinca(marca)
              : comando === 'borrar-dibujos'
                ? await borrarDibujos(marca)
                : comando === 'borrar-imagenes'
                  ? await borrarImagenes(marca)
            : await teardown(marca)

  // El spec lee esto por stdout.
  console.log(JSON.stringify(resultado))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
