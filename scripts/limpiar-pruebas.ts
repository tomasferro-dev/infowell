import 'dotenv/config'

import bcrypt from 'bcryptjs'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Saca de la base lo que quedó de las pruebas y deja lista una cuenta para el
 * cliente.
 *
 * Corre en seco por defecto: `npx tsx scripts/limpiar-pruebas.ts` muestra qué
 * tocaría sin tocar nada. Con `--aplicar` lo hace.
 *
 * Es la MISMA base que usa la app publicada, así que el paso en seco no es
 * ceremonia: es la única forma de ver qué se lleva puesto antes de que se lo
 * lleve.
 */

/** Nombres que delatan un dato de prueba. */
const DE_PRUEBA = /e2e-|^TEST$|Finca Propia|Finca Ajena|CON ESPERA|SIN ESPERA|pozo test|Pozo secreto/i

const APLICAR = process.argv.includes('--aplicar')

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
  })

  const fincas = (await prisma.farm.findMany({ select: { id: true, name: true } })).filter((f) =>
    DE_PRUEBA.test(f.name),
  )

  const pozos = (
    await prisma.well.findMany({ select: { id: true, name: true, farm: { select: { name: true } } } })
  ).filter((p) => DE_PRUEBA.test(p.name))

  const dibujos = (
    await prisma.mapAnnotation.findMany({ select: { id: true, label: true, farmId: true } })
  ).filter((d) => DE_PRUEBA.test(d.label ?? ''))

  const usuarios = (await prisma.user.findMany({ select: { id: true, email: true } })).filter((u) =>
    DE_PRUEBA.test(u.email),
  )

  console.log(APLICAR ? '=== APLICANDO ===' : '=== EN SECO (nada se toca) ===')

  console.log(`\nFincas a borrar (${fincas.length}):`)
  for (const f of fincas) console.log(`  - ${f.name}`)

  console.log(`\nPozos a borrar (${pozos.length}):`)
  for (const p of pozos) console.log(`  - ${p.farm.name} → ${p.name}`)

  console.log(`\nDibujos a borrar (${dibujos.length}):`)
  for (const d of dibujos) console.log(`  - ${d.label}${d.farmId ? '' : ' (suelto)'}`)

  console.log(`\nUsuarios a borrar (${usuarios.length}):`)
  for (const u of usuarios) console.log(`  - ${u.email}`)

  if (!APLICAR) {
    console.log('\nNada se tocó. Para aplicarlo: npx tsx scripts/limpiar-pruebas.ts --aplicar')
    await prisma.$disconnect()
    return
  }

  // El ORDEN importa: las fincas arrastran en cascada sus pozos, remitos e
  // intervenciones; los usuarios van al final porque esos registros los
  // referencian como autor y esa relación no tiene cascada.
  await prisma.mapAnnotation.deleteMany({ where: { id: { in: dibujos.map((d) => d.id) } } })
  await prisma.well.deleteMany({ where: { id: { in: pozos.map((p) => p.id) } } })
  await prisma.farm.deleteMany({ where: { id: { in: fincas.map((f) => f.id) } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } })

  console.log('\n✓ Borrado')

  // La cuenta para el cliente.
  const email = 'nahuelarenas@arenas.com.ar'
  const passwordHash = await bcrypt.hash('nahuel21', 12)

  const usuario = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', isActive: true, passwordHash },
    create: {
      email,
      name: 'Nahuel Arenas',
      role: 'ADMIN',
      isActive: true,
      passwordHash,
      // Sin esto Auth.js no lo deja entrar: el campo existe para el flujo de
      // verificación por mail, que este proyecto no usa.
      emailVerified: new Date(),
    },
    select: { email: true, role: true },
  })

  console.log(`✓ Usuario: ${usuario.email} (${usuario.role})`)

  console.log('\n=== QUEDA EN LA BASE ===')
  for (const f of await prisma.farm.findMany({
    select: { name: true, _count: { select: { wells: true } } },
    orderBy: { name: 'asc' },
  })) {
    console.log(`  ${f.name} (${f._count.wells} pozos)`)
  }
  console.log('  usuarios:', (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email).join(', '))
  console.log('  dibujos:', await prisma.mapAnnotation.count())

  await prisma.$disconnect()
}

main()
