import { z } from 'zod'

/**
 * Esquemas compartidos entre el formulario (cliente) y la Server Action
 * (servidor). El servidor SIEMPRE revalida: la validación del cliente es
 * comodidad, no seguridad.
 */

/**
 * Los formularios HTML mandan "" para todo campo opcional sin tocar. Sin esta
 * coerción se guardarían cadenas vacías en lugar de NULL, y las consultas del
 * tipo "fincas sin teléfono" darían resultados falsos.
 */
const textoOpcional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

/** Verifica el dígito verificador del CUIT (módulo 11). Atrapa typos reales. */
function cuitEsValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0)

  const resto = suma % 11
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto

  return verificador === Number(cuit[10])
}

const cuitOpcional = z
  .string()
  .trim()
  .transform((v) => v.replace(/[.\-\s]/g, '')) // se acepta 30-71234567-8 y 30712345678
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine((v) => v === undefined || cuitEsValido(v), {
    message: 'El CUIT no es válido',
  })

const emailOpcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine((v) => v === undefined || z.email().safeParse(v).success, {
    message: 'El email no es válido',
  })

/** Número opcional acotado a un rango. Acepta coma decimal (teclado es-AR). */
const numeroOpcional = (min: number, max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v.replace(',', '.'))))
    .optional()
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= min && v <= max), {
      message: mensaje,
    })

// ─────────────────────────────────────────────────────────────
// FINCA
// ─────────────────────────────────────────────────────────────

export const crearFincaSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  taxId: cuitOpcional,
  address: textoOpcional(),
  city: textoOpcional(100),
  province: textoOpcional(100),
  contactName: textoOpcional(120),
  contactPhone: textoOpcional(40),
  contactEmail: emailOpcional,
  notes: textoOpcional(2000),
})

export const editarFincaSchema = crearFincaSchema

export type CrearFincaInput = z.infer<typeof crearFincaSchema>

// ─────────────────────────────────────────────────────────────
// POZO
// ─────────────────────────────────────────────────────────────

export const crearPozoSchema = z.object({
  name: z.string().trim().min(2, 'Identificá el pozo con un nombre').max(120),
  code: textoOpcional(60),
  latitude: numeroOpcional(-90, 90, 'La latitud debe estar entre -90 y 90'),
  longitude: numeroOpcional(-180, 180, 'La longitud debe estar entre -180 y 180'),
  drilledAt: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : new Date(v)))
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(v.getTime()), { message: 'Fecha inválida' })
    // Un pozo no puede haberse perforado mañana: casi siempre es un typo.
    .refine((v) => v === undefined || v <= new Date(), {
      message: 'La fecha de perforación no puede ser futura',
    }),
  notes: textoOpcional(2000),
})

export const editarPozoSchema = crearPozoSchema

export type CrearPozoInput = z.infer<typeof crearPozoSchema>

// ─────────────────────────────────────────────────────────────
// USUARIO
// ─────────────────────────────────────────────────────────────

const rolSchema = z.enum(['ADMIN', 'CARGADOR', 'CLIENTE'])

export const crearUsuarioSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => z.email().safeParse(v).success, { message: 'El email no es válido' }),
  name: textoOpcional(120),
  role: rolSchema,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  farmIds: z.array(z.string()).default([]),
})

/** Al editar, la contraseña es opcional: vacía = no se cambia. */
export const editarUsuarioSchema = crearUsuarioSchema.extend({
  password: z
    .string()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length >= 8, {
      message: 'La contraseña debe tener al menos 8 caracteres',
    }),
})

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>
