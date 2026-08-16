import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

import { PrismaClient } from '../src/generated/prisma/client'
import { toSlug } from '../src/lib/slug'

const connectionString = process.env.DIRECT_URL

if (!connectionString) {
  throw new Error('Falta DIRECT_URL para correr el seed.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

/**
 * Los 13 servicios base del rubro. Entran con isSystem = true: el admin puede
 * desactivarlos pero no borrarlos, porque hay historial que los referencia.
 * El nombre del icono es de lucide-react y alimenta la card seleccionable.
 */
const SERVICIOS_BASE = [
  { name: 'Perforación de pozo', icon: 'Drill' },
  { name: 'Limpieza de perforación', icon: 'Brush' },
  { name: 'Desarrollo de perforación', icon: 'Waves' },
  { name: 'Mantenimiento y rehabilitación de pozo', icon: 'Wrench' },
  { name: 'Venta de electrobomba', icon: 'ShoppingCart' },
  { name: 'Alquiler de electrobomba', icon: 'CalendarClock' },
  { name: 'Reparación de electrobomba', icon: 'Hammer' },
  { name: 'Bobinado', icon: 'CircuitBoard' },
  { name: 'Extracción de electrobomba', icon: 'ArrowUpFromLine' },
  { name: 'Colocación de electrobomba', icon: 'ArrowDownToLine' },
  { name: 'Filmación de pozo', icon: 'Video' },
  { name: 'Pesca de electrobomba', icon: 'Anchor' },
  { name: 'Estudio geológico', icon: 'Mountain' },
] as const

async function seedServicios() {
  for (const [index, servicio] of SERVICIOS_BASE.entries()) {
    const slug = toSlug(servicio.name)

    // upsert por slug: el seed es idempotente, se puede correr N veces.
    await prisma.serviceType.upsert({
      where: { slug },
      update: { name: servicio.name, icon: servicio.icon, sortOrder: index, isSystem: true },
      create: {
        name: servicio.name,
        slug,
        icon: servicio.icon,
        sortOrder: index,
        isSystem: true,
      },
    })
  }

  console.log(`✓ ${SERVICIOS_BASE.length} servicios base`)
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.log('· SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD sin definir → se omite el admin')
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.upsert({
    where: { email },
    // No se pisa el hash si el usuario ya existe: evita resetear la clave del
    // admin de producción cada vez que corre el seed en un deploy.
    update: { role: 'ADMIN', isActive: true },
    create: {
      email,
      name: 'Administrador',
      role: 'ADMIN',
      passwordHash,
      emailVerified: new Date(),
    },
  })

  console.log(`✓ admin: ${email}`)
}

async function main() {
  await seedServicios()
  await seedAdmin()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
