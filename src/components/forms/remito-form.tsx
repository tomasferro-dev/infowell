'use client'

import { useActionState, useState } from 'react'

import { BotonGuardar, Campo, CampoTexto, ErrorGeneral } from '@/components/forms/form-parts'
import { PhotoCapture } from '@/components/forms/photo-capture'
import { Label } from '@/components/ui/label'
import type { FormState } from '@/server/actions/farms'

/**
 * Alta de remito, optimizada para el Cargador: fecha ya puesta, monto con
 * teclado numérico y la cámara a un toque. El objetivo es cargarlo en menos de
 * un minuto, parado en el campo.
 */
export function RemitoForm({
  action,
  farmId,
  fechaPorDefecto,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  farmId: string
  fechaPorDefecto: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  // Agrupa las fotos en Storage antes de que exista la fila del remito.
  const [borradorId] = useState(() => crypto.randomUUID())
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="issueDate"
          label="Fecha del remito"
          type="date"
          required
          defaultValue={fechaPorDefecto}
          error={err.issueDate}
        />

        <Campo
          name="amount"
          label="Monto"
          required
          // decimal abre el teclado numérico con coma en Android e iOS.
          inputMode="decimal"
          error={err.amount}
          placeholder="15.000,50"
          hint="Se acepta 15.000,50 o 15000.50"
        />
      </div>

      <Campo
        name="number"
        label="N° de remito"
        error={err.number}
        hint="Opcional, si el papel lo trae."
      />

      <div className="space-y-2">
        <Label>Fotos del remito</Label>
        <PhotoCapture farmId={farmId} borradorId={borradorId} />
      </div>

      <CampoTexto
        name="description"
        label="Detalle"
        rows={3}
        error={err.description}
        placeholder="Opcional: qué incluye este remito."
      />

      <ErrorGeneral mensaje={state.error} />
      <BotonGuardar>Guardar remito</BotonGuardar>
    </form>
  )
}
