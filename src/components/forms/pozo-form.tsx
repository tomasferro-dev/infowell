'use client'

import { useActionState } from 'react'

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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  pozo?: Pozo
  textoBoton?: string
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="latitude"
          label="Latitud"
          // decimal, no numeric: el teclado numérico de iOS no trae el signo
          // menos, y en Argentina todas las latitudes son negativas.
          inputMode="decimal"
          defaultValue={pozo?.latitude ?? ''}
          error={err.latitude}
          placeholder="-32.8895"
        />
        <Campo
          name="longitude"
          label="Longitud"
          inputMode="decimal"
          defaultValue={pozo?.longitude ?? ''}
          error={err.longitude}
          placeholder="-68.8458"
        />
      </div>

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
