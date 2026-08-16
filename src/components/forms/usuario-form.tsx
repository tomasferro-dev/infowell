'use client'

import { useActionState, useState } from 'react'

import { BotonGuardar, Campo, ErrorGeneral } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import type { FormState } from '@/server/actions/farms'

type Finca = { id: string; name: string }

const ROLES = [
  {
    value: 'ADMIN',
    label: 'Administrador',
    detalle: 'Gestiona todo: fincas, pozos, intervenciones, remitos y usuarios.',
  },
  {
    value: 'CARGADOR',
    label: 'Cargador',
    detalle: 'Solo carga remitos, en las fincas que le asignes.',
  },
  {
    value: 'CLIENTE',
    label: 'Cliente',
    detalle: 'Solo lectura, únicamente de las fincas que le asignes.',
  },
] as const

export function UsuarioForm({
  action,
  fincas,
  usuario,
  textoBoton,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  fincas: Finca[]
  usuario?: {
    email: string
    name: string | null
    role: string
    farmIds: string[]
  }
  textoBoton?: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
  const [rol, setRol] = useState(usuario?.role ?? 'CLIENTE')
  const err = state.fieldErrors ?? {}

  const esEdicion = !!usuario
  // El admin ve todas las fincas por definición: asignarle membresías no
  // cambia nada, así que se oculta el selector para no confundir.
  const necesitaFincas = rol !== 'ADMIN'

  return (
    <form action={formAction} className="space-y-5">
      <Campo
        name="name"
        label="Nombre"
        defaultValue={usuario?.name ?? ''}
        error={err.name}
        placeholder="Juan Pérez"
      />

      <Campo
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        required
        defaultValue={usuario?.email ?? ''}
        error={err.email}
      />

      <Campo
        name="password"
        label={esEdicion ? 'Nueva contraseña' : 'Contraseña'}
        type="password"
        autoComplete="new-password"
        required={!esEdicion}
        error={err.password}
        hint={esEdicion ? 'Dejala vacía para no cambiarla.' : 'Mínimo 8 caracteres.'}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Rol</legend>
        {ROLES.map((r) => (
          <label
            key={r.value}
            className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={rol === r.value}
              onChange={() => setRol(r.value)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block font-medium">{r.label}</span>
              <span className="text-muted-foreground block text-xs">{r.detalle}</span>
            </span>
          </label>
        ))}
        {err.role ? <p className="text-destructive text-xs font-medium">{err.role}</p> : null}
      </fieldset>

      {necesitaFincas ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Fincas asignadas</legend>

          {fincas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay fincas para asignar. Creá una primero.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {fincas.map((finca) => (
                <Label
                  key={finca.id}
                  className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md p-2 font-normal"
                >
                  <input
                    type="checkbox"
                    name="farmIds"
                    value={finca.id}
                    defaultChecked={usuario?.farmIds.includes(finca.id)}
                  />
                  {finca.name}
                </Label>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            Sin fincas asignadas, este usuario no verá absolutamente nada.
          </p>
        </fieldset>
      ) : null}

      <ErrorGeneral mensaje={state.error} />
      <BotonGuardar>{textoBoton ?? 'Guardar usuario'}</BotonGuardar>
    </form>
  )
}
