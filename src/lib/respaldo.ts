import { z } from 'zod'

/**
 * El formato del respaldo: fincas, pozos, dibujos e historial en un archivo.
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
 *   - Las IMÁGENES calzadas sobre el mapa, por lo mismo: la fila sabe dónde va
 *     la imagen, pero la imagen es un archivo del bucket. Restaurar solo la
 *     fila dejaría rectángulos vacíos sobre el terreno, que es peor que no
 *     tener nada — el usuario vería un hueco y creería que el mapa se rompió.
 *   - Las OBSERVACIONES que eran solo una nota de voz: sin el audio quedarían
 *     vacías, y el modelo exige texto o audio. Las que tienen texto sí van.
 *   - Los USUARIOS y sus contraseñas. Por eso, al importar, el historial queda
 *     a nombre de quien importó: no hay a quién más atribuírselo.
 *
 * La pantalla lo dice con todas las letras. Un respaldo que promete más de lo
 * que guarda es peor que no tener ninguno.
 */

/**
 * Sube de número si el formato cambia de forma incompatible.
 *
 * 2: se agregó el historial (intervenciones, mediciones y observaciones de
 *    texto). Un archivo de la versión 1 sigue importándose: el campo nuevo
 *    tiene `.default([])`, así que su ausencia no es un error.
 */
export const VERSION_RESPALDO = 2

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

/** Solo la fecha, sin hora: acá se anotan días de trabajo, no instantes. */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')

/** Una medida guardada como texto, tal como sale de un Decimal de la base. */
const medida = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || Number.isFinite(Number(v)), 'Medida inválida')

/**
 * Un servicio de la visita, identificado por SLUG.
 *
 * Por slug y no por id: los cuid son distintos en cada base, así que un
 * respaldo que llevara ids no se podría importar en otra — que es la mitad
 * del propósito de esto. `slug` tiene índice único, así que es una llave
 * natural estable.
 */
const servicioSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  detail: texto,
})

const medicionSchema = z.object({
  measuredAt: dia,
  depthM: medida,
  pumpDepthM: medida,
  dynamicLevelM: medida,
  staticLevelM: medida,
  boreDiameterIn: medida,
  flowRateM3H: medida,
  /** La electrobomba por su etiqueta normalizada, que también es única. */
  bomba: z.string().trim().max(200).nullable().optional(),
})

/**
 * Una observación, SOLO su texto.
 *
 * Las notas de voz quedan afuera igual que los remitos: el audio vive en el
 * bucket y un JSON no lo lleva. Y una observación que era solo audio no se
 * exporta en absoluto — importarla vacía violaría la regla del modelo, que
 * exige texto o audio.
 */
const observacionSchema = z.object({
  /** Va el id para poder reimportar sin duplicar NI borrar lo agregado después. */
  id: z.string().min(1),
  body: z.string().trim().min(1).max(10000),
})

const intervencionSchema = z.object({
  id: z.string().min(1),
  wellId: z.string().min(1),
  performedAt: dia,
  servicios: z.array(servicioSchema).default([]),
  medicion: medicionSchema.nullable().optional(),
  observaciones: z.array(observacionSchema).default([]),
})

export const respaldoSchema = z.object({
  version: z.number().int().positive(),
  exportadoEl: z.string().optional(),
  fincas: z.array(fincaSchema).default([]),
  dibujos: z.array(dibujoSchema).default([]),
  intervenciones: z.array(intervencionSchema).default([]),
})

export type Respaldo = z.infer<typeof respaldoSchema>
export type FincaRespaldo = z.infer<typeof fincaSchema>
export type DibujoRespaldo = z.infer<typeof dibujoSchema>
export type IntervencionRespaldo = z.infer<typeof intervencionSchema>

/** El nombre del archivo, con la fecha adentro para no pisarse entre copias. */
export function nombreDeArchivo(ahora = new Date()): string {
  const [fecha] = ahora.toISOString().split('T')
  return `infowell-respaldo-${fecha}.json`
}
