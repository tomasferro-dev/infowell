'use client'

import { useActionState } from 'react'

import { BotonGuardar, Campo, CampoTexto, ErrorGeneral } from '@/components/forms/form-parts'
import type { FormState } from '@/server/actions/farms'

type Finca = {
  name: string
  taxId: string | null
  address: string | null
  city: string | null
  province: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
}

export function FincaForm({
  action,
  finca,
  textoBoton,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  finca?: Finca
  textoBoton?: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-5">
      <Campo
        name="name"
        label="Nombre o razón social"
        required
        defaultValue={finca?.name}
        error={err.name}
        placeholder="Finca La Esperanza"
      />

      <Campo
        name="taxId"
        label="CUIT"
        inputMode="numeric"
        defaultValue={finca?.taxId ?? ''}
        error={err.taxId}
        hint="Opcional. Con o sin guiones."
        placeholder="30-71234567-1"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="city"
          label="Localidad"
          defaultValue={finca?.city ?? ''}
          error={err.city}
        />
        <Campo
          name="province"
          label="Provincia"
          defaultValue={finca?.province ?? ''}
          error={err.province}
        />
      </div>

      <Campo
        name="address"
        label="Dirección"
        defaultValue={finca?.address ?? ''}
        error={err.address}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="contactName"
          label="Contacto"
          defaultValue={finca?.contactName ?? ''}
          error={err.contactName}
        />
        <Campo
          name="contactPhone"
          label="Teléfono"
          type="tel"
          inputMode="tel"
          defaultValue={finca?.contactPhone ?? ''}
          error={err.contactPhone}
        />
      </div>

      <Campo
        name="contactEmail"
        label="Email de contacto"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        defaultValue={finca?.contactEmail ?? ''}
        error={err.contactEmail}
      />

      <CampoTexto
        name="notes"
        label="Notas"
        rows={3}
        defaultValue={finca?.notes ?? ''}
        error={err.notes}
      />

      <ErrorGeneral mensaje={state.error} />
      <BotonGuardar>{textoBoton ?? 'Guardar finca'}</BotonGuardar>
    </form>
  )
}
