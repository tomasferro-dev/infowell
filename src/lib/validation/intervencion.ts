import { z } from 'zod'

/**
 * Esquema del formulario único de intervención: los tres módulos (servicios,
 * estado técnico y observaciones) entran en un solo submit.
 */

/**
 * Medición opcional. Todas comparten la misma forma: vienen del formulario como
 * texto, aceptan coma decimal (es lo que tipea el teclado en español) y quedan
 * en undefined si el técnico no las midió — que es el caso habitual.
 */
const medicion = (max: number, unidad: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v.replace(',', '.'))))
    .optional()
    .refine((v) => v === undefined || Number.isFinite(v), { message: 'Tiene que ser un número' })
    .refine((v) => v === undefined || v >= 0, { message: 'No puede ser negativo' })
    .refine((v) => v === undefined || v <= max, { message: `El máximo es ${max} ${unidad}` })

const idOpcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()

/** Referencia a un audio ya guardado en Storage. */
const notaDeVozSchema = z.object({
  ruta: z.string().min(1),
  mime: z.string().min(1),
  duracion: z.number().int().min(0).max(24 * 60 * 60),
})

export type NotaDeVoz = z.infer<typeof notaDeVozSchema>

export const crearIntervencionSchema = z
  .object({
    performedAt: z
      .string()
      .trim()
      .min(1, 'Indicá la fecha del trabajo')
      .transform((v) => new Date(v))
      .refine((v) => !Number.isNaN(v.getTime()), { message: 'Fecha inválida' })
      .refine((v) => v <= new Date(), { message: 'La fecha no puede ser futura' }),

    // MÓDULO A — servicios marcados en las cards.
    serviceTypeIds: z
      .array(z.string())
      .default([])
      // El formulario puede mandar el mismo id repetido si algo se re-renderiza.
      .transform((ids) => [...new Set(ids)]),

    // MÓDULO B — estado técnico. Los máximos son topes de sanidad: filtran el
    // dedazo (42500 en vez de 42,5) sin estorbar ninguna medición real.
    depthM: medicion(2000, 'm'),
    pumpDepthM: medicion(2000, 'm'),
    dynamicLevelM: medicion(2000, 'm'),
    staticLevelM: medicion(2000, 'm'),
    boreDiameterIn: medicion(100, 'pulgadas'),
    flowRateM3H: medicion(1000, 'm³/h'),
    pumpId: idOpcional,

    // MÓDULO C — observaciones en lenguaje natural + nota de voz.
    observations: z
      .string()
      .trim()
      .max(5000)
      .transform((v) => (v === '' ? undefined : v))
      .optional(),

    /**
     * Notas de voz ya subidas a Storage: el formulario solo trae sus
     * referencias, nunca el audio.
     *
     * Cada una llega como un JSON en un mismo campo repetido. Se eligió así en
     * vez de tres arreglos paralelos (rutas, formatos, duraciones) porque
     * esos se desalinean apenas falta un dato, y ahí una nota quedaría con la
     * duración de otra.
     */
    voiceNotes: z
      .array(z.string())
      .default([])
      .transform((crudas) =>
        crudas
          .map((cruda) => {
            try {
              return JSON.parse(cruda) as unknown
            } catch {
              return null
            }
          })
          .filter((v): v is NotaDeVoz => notaDeVozSchema.safeParse(v).success)
          .map((v) => notaDeVozSchema.parse(v)),
      ),
  })
  /**
   * El nivel dinámico se mide con la bomba en marcha: el agua está siempre a
   * igual o mayor profundidad que en reposo. Al revés es, casi con seguridad,
   * que se cargaron los dos campos cruzados.
   */
  .refine(
    (d) =>
      d.dynamicLevelM === undefined ||
      d.staticLevelM === undefined ||
      d.dynamicLevelM >= d.staticLevelM,
    {
      message: 'El nivel dinámico no puede ser más somero que el estático. ¿Están cruzados?',
      path: ['dynamicLevelM'],
    },
  )
  /**
   * Una visita tiene que dejar algo registrado. Sin este corte, un submit
   * accidental crea una intervención fantasma: con fecha y sin información.
   */
  .refine(
    (d) =>
      d.serviceTypeIds.length > 0 ||
      d.observations !== undefined ||
      // Una nota de voz sola alcanza: es contenido real de la visita.
      d.voiceNotes.length > 0 ||
      [
        d.depthM,
        d.pumpDepthM,
        d.dynamicLevelM,
        d.staticLevelM,
        d.boreDiameterIn,
        d.flowRateM3H,
      ].some((v) => v !== undefined) ||
      d.pumpId !== undefined,
    { message: 'Marcá al menos un servicio, cargá una medición o escribí una observación' },
  )

export type CrearIntervencionInput = z.infer<typeof crearIntervencionSchema>

/** Los campos del módulo B, para recorrerlos sin repetir la lista. */
export const CAMPOS_MEDICION = [
  { name: 'depthM', label: 'Profundidad', unidad: 'm' },
  { name: 'pumpDepthM', label: 'Altura de la bomba', unidad: 'm' },
  { name: 'staticLevelM', label: 'Nivel estático', unidad: 'm' },
  { name: 'dynamicLevelM', label: 'Nivel dinámico', unidad: 'm' },
  { name: 'boreDiameterIn', label: 'Diámetro de perforación', unidad: '″' },
  { name: 'flowRateM3H', label: 'Caudal', unidad: 'm³/h' },
] as const

export type CampoMedicion = (typeof CAMPOS_MEDICION)[number]['name']
