import { z } from 'zod'

/**
 * Interpreta un monto escrito a mano en el celular.
 *
 * En es-AR el punto separa miles y la coma decimales, pero el teclado numérico
 * del teléfono ofrece el punto, así que llegan las dos convenciones mezcladas.
 * La heurística resuelve la ambigüedad del punto por el tamaño del último
 * grupo: "15.000" son quince mil, pero "15000.50" son quince mil con cincuenta.
 *
 * Devuelve null si no hay nada interpretable — nunca 0, que sería un monto
 * válido y silenciaría el error.
 */
export function parsearMonto(entrada: string): number | null {
  const limpio = entrada.replace(/[^\d.,-]/g, '').trim()
  if (limpio === '' || !/\d/.test(limpio)) return null

  let normalizado: string

  if (limpio.includes(',')) {
    // Con coma presente no hay ambigüedad: la coma es el decimal.
    normalizado = limpio.replace(/\./g, '').replace(',', '.')
  } else if (limpio.includes('.')) {
    const grupos = limpio.split('.')
    const ultimo = grupos[grupos.length - 1]!

    // Un último grupo de exactamente 3 dígitos, con algo delante, es un
    // separador de miles ("15.000"). Cualquier otro largo es decimal ("15.5").
    const esMiles = ultimo.length === 3 && grupos.length >= 2 && grupos[0] !== ''
    normalizado = esMiles ? grupos.join('') : limpio.replace(/\.(?=.*\.)/g, '')
  } else {
    normalizado = limpio
  }

  const valor = Number(normalizado)
  return Number.isFinite(valor) ? valor : null
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

export const crearRemitoSchema = z.object({
  issueDate: z
    .string()
    .trim()
    .min(1, 'Indicá la fecha del remito')
    .transform((v) => new Date(v))
    .refine((v) => !Number.isNaN(v.getTime()), { message: 'Fecha inválida' })
    .refine((v) => v <= new Date(), { message: 'La fecha no puede ser futura' }),

  amount: z
    .string()
    .trim()
    .min(1, 'Indicá el monto')
    .transform((v) => parsearMonto(v))
    .refine((v): v is number => v !== null, { message: 'El monto no es un número válido' })
    .refine((v) => v > 0, { message: 'El monto tiene que ser mayor a cero' })
    // Tope de sanidad: filtra el dedazo sin estorbar ningún remito real.
    .refine((v) => v <= 999_999_999, { message: 'El monto es demasiado grande' }),

  number: textoOpcional(60),
  description: textoOpcional(2000),

  /** Rutas de Storage de las fotos ya subidas, en el orden que eligió el usuario. */
  photos: z.array(z.string()).default([]),
})

export type CrearRemitoInput = z.infer<typeof crearRemitoSchema>

/** Formatea un monto para mostrar. Los Decimal de Prisma llegan como string. */
export function formatearMonto(valor: number | string, moneda = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(Number(valor))
}
