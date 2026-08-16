'use client'

import { useActionState } from 'react'

import { CreatableCombobox, type OpcionCombobox } from '@/components/forms/creatable-combobox'
import { BotonGuardar, Campo, CampoTexto, ErrorGeneral } from '@/components/forms/form-parts'
import { ServiceCardPicker, type Servicio } from '@/components/forms/service-card-picker'
import { VoiceRecorder } from '@/components/forms/voice-recorder'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CAMPOS_MEDICION } from '@/lib/validation/intervencion'
import { crearBombaAction } from '@/server/actions/catalog'
import type { FormState } from '@/server/actions/farms'

/**
 * Formulario único de intervención: los tres módulos y un solo Submit.
 *
 * Está armado así porque en el campo los tres ocurren en la misma visita: el
 * técnico marca qué hizo, anota lo que midió y dicta una observación. Pedirle
 * tres formularios separados garantiza que el segundo y el tercero no se
 * carguen nunca.
 */
export function IntervencionForm({
  action,
  servicios,
  bombas,
  fechaPorDefecto,
  farmId,
  wellId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  servicios: Servicio[]
  bombas: OpcionCombobox[]
  fechaPorDefecto: string
  /** Para firmar la subida del audio: la finca decide el permiso. */
  farmId: string
  wellId: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-8">
      <Campo
        name="performedAt"
        label="Fecha del trabajo"
        type="date"
        required
        defaultValue={fechaPorDefecto}
        error={err.performedAt}
        hint="Por defecto hoy. Cambiala si estás cargando una visita anterior."
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Servicios realizados</h2>
          <p className="text-muted-foreground text-sm">
            Tocá todos los que correspondan a esta visita.
          </p>
        </div>
        <ServiceCardPicker servicios={servicios} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Estado técnico</h2>
          <p className="text-muted-foreground text-sm">
            Todos opcionales: cargá solo lo que hayas medido.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_MEDICION.map((campo) => (
            <Campo
              key={campo.name}
              name={campo.name}
              label={`${campo.label} (${campo.unidad})`}
              // decimal y no numeric: el teclado numérico de iOS no trae coma
              // ni punto, y estas mediciones casi siempre llevan decimales.
              inputMode="decimal"
              error={err[campo.name]}
            />
          ))}
        </div>

        <div className="space-y-2">
          <Label>Electrobomba instalada</Label>
          <CreatableCombobox
            name="pumpId"
            opciones={bombas}
            onCrear={crearBombaAction}
            placeholder="Buscar o registrar una electrobomba…"
            etiquetaCrear="Registrar"
            etiqueta="Electrobomba instalada"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Observaciones</h2>
          <p className="text-muted-foreground text-sm">
            Trabajos realizados, recomendaciones, lo que haya que dejar asentado.
          </p>
        </div>

        <CampoTexto
          name="observations"
          label="Notas de la visita"
          rows={5}
          error={err.observations}
          placeholder="Se limpió el filtro y se cambió el manómetro. Se recomienda revisar el tablero en la próxima visita."
        />

        <VoiceRecorder farmId={farmId} recursoId={wellId} />
      </section>

      <ErrorGeneral mensaje={state.error} />
      <BotonGuardar>Guardar intervención</BotonGuardar>
    </form>
  )
}
