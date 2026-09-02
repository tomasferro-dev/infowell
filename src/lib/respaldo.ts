import { z } from 'zod'

/**
 * El formato del respaldo: fincas, pozos y dibujos en un solo archivo.
 *
 * Sirve para dos cosas distintas que resultan ser la misma: guardarse una
 * copia, y mudar los datos a otra base —por ejemplo al separar la de pruebas
 * de la que usa la empresa—.
 *
 * ⚠️ NO es un respaldo completo. Quedan afuera a propósito:
 *
 *   - Los REMITOS y las NOTAS DE VOZ, porque sus fotos y audios viven en el
 *     almacenamiento de archivos y un JSON no puede llevarlos. Restaurar solo
 *     la fila dejaría remitos que apuntan a fotos que no existen.
 *   - El HISTORIAL de intervenciones y mediciones, que es mucho más volumen y
 *     no hace falta para el propósito de esto: dejar el mapa cargado.
 *   - Los USUARIOS y sus contraseñas.
 *
 * La pantalla lo dice con todas las letras. Un respaldo que promete más de lo
 * que guarda es peor que no tener ninguno.
 */

/** Sube de número si el formato cambia de forma incompatible. */
export const VERSION_RESPALDO = 1

const texto = z.string().trim().max(1000).nullable().optional()

/** Una coordenada guardada como texto, tal como sale de la base. */
const coordenada = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || Number.isFinite(Number(v)), 'Coordenada inválida')

const pozoSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  code: texto,
  latitude: coordenada,
  longitude: coordenada,
  /** Solo la fecha, sin hora: es el día en que se perforó. */
  drilledAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')
    .nullable()
    .optional(),
  notes: texto,
  isActive: z.boolean().optional(),
})

const fincaSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  taxId: texto,
  address: texto,
  city: texto,
  province: texto,
  contactName: texto,
  contactPhone: texto,
  contactEmail: texto,
  notes: texto,
  latitude: coordenada,
  longitude: coordenada,
  isActive: z.boolean().optional(),
  pozos: z.array(pozoSchema).default([]),
})

const dibujoSchema = z.object({
  id: z.string().min(1),
  farmId: z.string().nullable().optional(),
  wellId: z.string().nullable().optional(),
  kind: z.enum(['PUNTO', 'LINEA', 'POLIGONO']),
  label: texto,
  notes: texto,
  color: z.string().max(40),
  filled: z.boolean(),
  /** Se valida en el servidor con validarGeometria, que ya conoce las reglas. */
  geometry: z.unknown(),
})

export const respaldoSchema = z.object({
  version: z.number().int().positive(),
  exportadoEl: z.string().optional(),
  fincas: z.array(fincaSchema).default([]),
  dibujos: z.array(dibujoSchema).default([]),
})

export type Respaldo = z.infer<typeof respaldoSchema>
export type FincaRespaldo = z.infer<typeof fincaSchema>
export type DibujoRespaldo = z.infer<typeof dibujoSchema>

/** El nombre del archivo, con la fecha adentro para no pisarse entre copias. */
export function nombreDeArchivo(ahora = new Date()): string {
  const [fecha] = ahora.toISOString().split('T')
  return `infowell-respaldo-${fecha}.json`
}
