'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useRef } from 'react'

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
  farmIdParaMapa,
  wellIdParaMapa,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  pozo?: Pozo
  textoBoton?: string
  /** De dónde salió la ubicación que ya viene cargada, para poder decirlo. */
  origenUbicacion?: 'mapa'
  /** Si está, se ofrece elegir el punto en el mapa de esa finca. */
  farmIdParaMapa?: string
  /** Al editar: para que el mapa sepa que tiene que volver a la edición. */
  wellIdParaMapa?: string
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
    const params = new URLSearchParams({ colocar: farmIdParaMapa! })
    if (wellIdParaMapa) params.set('pozo', wellIdParaMapa)

    if (formulario.current) {
      const datos = new FormData(formulario.current)
      for (const campo of ['name', 'code', 'drilledAt', 'notes']) {
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
        onElegirEnMapa={farmIdParaMapa ? elegirEnMapa : undefined}
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
