'use client'

import { useActionState } from 'react'

import { CapturaGps } from '@/components/forms/captura-gps'
import { BotonGuardar, Campo, CampoTexto, ErrorGeneral } from '@/components/forms/form-parts'
import type { FormState } from '@/server/actions/farms'

type Pozo = {
  name: string
  code: string | null
  latitude: string | null
  longitude: string | null
  drilledAt: string | null
  notes: string | null
}

export function PozoForm({
  action,
  pozo,
  textoBoton,
  origenUbicacion,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  pozo?: Pozo
  textoBoton?: string
  /** De dónde salió la ubicación que ya viene cargada, para poder decirlo. */
  origenUbicacion?: 'mapa'
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-5">
      <Campo
        name="name"
        label="Nombre del pozo"
        required
        defaultValue={pozo?.name}
        error={err.name}
        placeholder="Pozo N° 1 - Sector Norte"
      />

      <Campo
        name="code"
        label="Código interno"
        defaultValue={pozo?.code ?? ''}
        error={err.code}
        hint="Opcional. Identificador catastral o interno."
      />

      <Campo
        name="drilledAt"
        label="Fecha de perforación"
        type="date"
        defaultValue={pozo?.drilledAt ?? ''}
        error={err.drilledAt}
        hint="Opcional. Si es un pozo preexistente, dejala vacía."
      />

      <CapturaGps
        latInicial={pozo?.latitude}
        lonInicial={pozo?.longitude}
        origen={origenUbicacion}
        etiqueta="Ubicación del pozo"
        ayuda="Marcala parado al lado del pozo. Es lo que lo hace aparecer en el mapa."
      />

      <CampoTexto
        name="notes"
        label="Notas"
        rows={3}
        defaultValue={pozo?.notes ?? ''}
        error={err.notes}
      />

      <ErrorGeneral mensaje={state.error} />
      <BotonGuardar>{textoBoton ?? 'Guardar pozo'}</BotonGuardar>
    </form>
  )
}
