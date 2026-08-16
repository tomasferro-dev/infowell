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

async function setup(marca: string) {
  const passwordHash = await bcrypt.hash(CLAVE_TEST, 10)

  const fincaPropia = await prisma.farm.create({
    data: {
      name: `${marca} Finca Propia`,
      // Un pozo propio listo: así cada test es independiente y no depende de
      // que otro lo haya creado antes.
      wells: { create: { name: `Pozo ${marca}` } },
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

async function teardown(marca: string) {
  // Borrado real, no baja lógica: son datos de prueba, no historial del cliente.
  //
  // El ORDEN importa: los remitos e intervenciones referencian a su autor
  // (createdById, sin cascade). Primero las fincas — que arrastran en cascada
  // pozos, remitos e intervenciones — y recién después los usuarios.
  await prisma.farm.deleteMany({ where: { name: { contains: marca } } })
  await prisma.user.deleteMany({ where: { email: { contains: marca } } })
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

async function main() {
  const [comando, marca] = process.argv.slice(2)

  if (!marca) throw new Error('Falta la marca de la corrida')

  const resultado =
    comando === 'setup'
      ? await setup(marca)
      : comando === 'teardown-catalogo'
        ? await teardownCatalogo(marca)
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
