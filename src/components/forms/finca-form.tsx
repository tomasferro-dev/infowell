'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useRef } from 'react'

import { CapturaGps } from '@/components/forms/captura-gps'
import { CAMPOS_ARRASTRADOS } from '@/lib/colocacion-mapa'
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
  /** Los Decimal de Prisma no cruzan al cliente: llegan ya como texto. */
  latitude: string | null
  longitude: string | null
}

export function FincaForm({
  action,
  finca,
  textoBoton,
  origenUbicacion,
  farmIdParaMapa,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  finca?: Finca
  textoBoton?: string
  /** De dónde salió la ubicación que ya viene cargada, para poder decirlo. */
  origenUbicacion?: 'mapa'
  /** Al editar: para que el mapa sepa a qué finca vuelve. En el alta no va. */
  farmIdParaMapa?: string
}) {
  const router = useRouter()
  const formulario = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  /**
   * Va al mapa a marcar el punto y se lleva lo ya escrito.
   *
   * Sin esto, ir al mapa desde un formulario a medio llenar lo borraría, y el
   * usuario aprendería a no usar el botón.
   */
  function elegirEnMapa() {
    const params = new URLSearchParams({ colocar: 'finca' })
    if (farmIdParaMapa) params.set('finca', farmIdParaMapa)

    if (formulario.current) {
      const datos = new FormData(formulario.current)
      for (const campo of CAMPOS_ARRASTRADOS.finca) {
        const valor = datos.get(campo)
        if (typeof valor === 'string' && valor !== '') params.set(campo, valor)
      }
    }

    router.push(`/mapa?${params}`)
  }

  return (
    <form ref={formulario} action={formAction} className="space-y-5">
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

      <CapturaGps
        latInicial={finca?.latitude}
        lonInicial={finca?.longitude}
        origen={origenUbicacion}
        onElegirEnMapa={elegirEnMapa}
        etiqueta="Ubicación de la finca"
        ayuda="El casco o la entrada. Sirve para ubicarla en el mapa."
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
