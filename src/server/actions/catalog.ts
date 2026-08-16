'use server'

import { revalidatePath } from 'next/cache'

import { toSlug } from '@/lib/slug'
import { prisma } from '@/server/db'
import { requireAccess } from '@/server/guards'

/**
 * Alta al vuelo y administración de los catálogos.
 *
 * Las altas al vuelo devuelven el item (no redirigen): las llama el combobox
 * desde el medio de un formulario, que no debe perder lo ya cargado.
 */

export type ResultadoAlta =
  | { ok: true; item: { id: string; label: string }; yaExistia: boolean }
  | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────

export async function crearServicioAction(nombre: string): Promise<ResultadoAlta> {
  await requireAccess('write', 'catalog')

  const label = nombre.trim()
  const slug = toSlug(label)

  if (slug === '') return { ok: false, error: 'Escribí un nombre válido' }
  if (label.length > 120) return { ok: false, error: 'El nombre es demasiado largo' }

  // Si ya existe se devuelve el existente en lugar de fallar: para el usuario,
  // el resultado buscado (tener ese servicio seleccionable) se cumple igual.
  const existente = await prisma.serviceType.findUnique({
    where: { slug },
    select: { id: true, name: true, isActive: true },
  })

  if (existente) {
    // Puede estar desactivado: se reactiva, que es lo que el usuario quiere.
    if (!existente.isActive) {
      await prisma.serviceType.update({ where: { id: existente.id }, data: { isActive: true } })
    }

    revalidatePath('/admin/servicios')
    return { ok: true, item: { id: existente.id, label: existente.name }, yaExistia: true }
  }

  const creado = await prisma.serviceType.create({
    // sortOrder alto: los del seed van primero, los nuevos al final.
    data: { name: label, slug, isSystem: false, sortOrder: 999 },
    select: { id: true, name: true },
  })

  revalidatePath('/admin/servicios')
  return { ok: true, item: { id: creado.id, label: creado.name }, yaExistia: false }
}

export async function alternarServicioAction(serviceTypeId: string, activar: boolean) {
  await requireAccess('write', 'catalog')

  await prisma.serviceType.update({
    where: { id: serviceTypeId },
    data: { isActive: activar },
  })

  revalidatePath('/admin/servicios')
}

export async function renombrarServicioAction(serviceTypeId: string, nombre: string) {
  await requireAccess('write', 'catalog')

  const label = nombre.trim()
  const slug = toSlug(label)
  if (slug === '') return

  // El slug se recalcula: si no, renombrar dejaría el slug viejo y dos
  // servicios distintos podrían converger al mismo nombre visible.
  await prisma.serviceType.update({
    where: { id: serviceTypeId },
    data: { name: label, slug },
  })

  revalidatePath('/admin/servicios')
}

// ─────────────────────────────────────────────────────────────
// ELECTROBOMBAS
// ─────────────────────────────────────────────────────────────

export async function crearBombaAction(etiqueta: string): Promise<ResultadoAlta> {
  await requireAccess('write', 'catalog')

  const label = etiqueta.trim()
  const normalizedLabel = toSlug(label)

  if (normalizedLabel === '') return { ok: false, error: 'Escribí un modelo válido' }
  if (label.length > 120) return { ok: false, error: 'El nombre es demasiado largo' }

  const existente = await prisma.pump.findUnique({
    where: { normalizedLabel },
    select: { id: true, label: true, isActive: true },
  })

  if (existente) {
    if (!existente.isActive) {
      await prisma.pump.update({ where: { id: existente.id }, data: { isActive: true } })
    }

    revalidatePath('/admin/bombas')
    return { ok: true, item: { id: existente.id, label: existente.label }, yaExistia: true }
  }

  const creada = await prisma.pump.create({
    data: { label, normalizedLabel, isSystem: false },
    select: { id: true, label: true },
  })

  revalidatePath('/admin/bombas')
  return { ok: true, item: { id: creada.id, label: creada.label }, yaExistia: false }
}

export async function alternarBombaAction(pumpId: string, activar: boolean) {
  await requireAccess('write', 'catalog')

  await prisma.pump.update({ where: { id: pumpId }, data: { isActive: activar } })
  revalidatePath('/admin/bombas')
}
