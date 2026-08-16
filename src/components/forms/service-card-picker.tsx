'use client'

import * as Icons from 'lucide-react'
import { Check, Loader2, Plus, Search } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { filtrarCatalogo } from '@/lib/catalog'
import { toSlug } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { crearServicioAction } from '@/server/actions/catalog'

export type Servicio = { id: string; label: string; slug: string; icon?: string | null }

/** Resuelve el icono de Lucide por nombre; cae en Wrench si no existe. */
function IconoServicio({ nombre }: { nombre?: string | null }) {
  const Componente =
    (nombre && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nombre]) ||
    Icons.Wrench

  return <Componente className="size-5" />
}

/**
 * Grilla de cards seleccionables (selección múltiple) + alta al vuelo.
 *
 * Publica un input oculto por servicio marcado, así el formulario contenedor
 * los envía como `serviceTypeIds` repetido, sin estado propio.
 */
export function ServiceCardPicker({
  name = 'serviceTypeIds',
  servicios,
  seleccionInicial = [],
  puedeCrear = true,
}: {
  name?: string
  servicios: Servicio[]
  seleccionInicial?: string[]
  puedeCrear?: boolean
}) {
  const [items, setItems] = useState(servicios)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set(seleccionInicial))
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState<string>()
  const [creando, iniciarCreacion] = useTransition()

  const filtrados = useMemo(
    () => filtrarCatalogo(items, busqueda, (s) => s.label),
    [items, busqueda],
  )

  const textoNuevo = busqueda.trim()
  const yaExiste = items.some((s) => s.slug === toSlug(textoNuevo))
  const ofrecerCrear = puedeCrear && textoNuevo.length > 0 && !yaExiste

  function alternar(id: string) {
    setSeleccionados((previos) => {
      const siguiente = new Set(previos)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  function crear() {
    iniciarCreacion(async () => {
      setError(undefined)
      const resultado = await crearServicioAction(textoNuevo)

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      const nuevo: Servicio = {
        id: resultado.item.id,
        label: resultado.item.label,
        slug: toSlug(resultado.item.label),
      }

      setItems((previos) => (previos.some((p) => p.id === nuevo.id) ? previos : [...previos, nuevo]))
      // Se marca solo: si el usuario lo creó, es porque lo hizo en esta visita.
      setSeleccionados((previos) => new Set(previos).add(nuevo.id))
      setBusqueda('')
    })
  }

  return (
    <div className="space-y-3">
      {[...seleccionados].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar servicio…"
          className="h-12 pl-9 text-base"
          aria-label="Buscar servicio"
        />
      </div>

      {ofrecerCrear ? (
        <Button
          type="button"
          variant="outline"
          onClick={crear}
          disabled={creando}
          className="h-12 w-full justify-start text-base"
        >
          {creando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Crear «{textoNuevo}»
        </Button>
      ) : null}

      {error ? <p className="text-destructive text-xs font-medium">{error}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        {filtrados.map((servicio) => {
          const marcado = seleccionados.has(servicio.id)

          return (
            <button
              key={servicio.id}
              type="button"
              onClick={() => alternar(servicio.id)}
              aria-pressed={marcado}
              className={cn(
                // min-h-20: objetivo táctil holgado, se toca con guantes.
                'relative flex min-h-20 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                marcado
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'hover:bg-accent text-muted-foreground',
              )}
            >
              {marcado ? (
                <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full">
                  <Check className="size-3" />
                </span>
              ) : null}

              <IconoServicio nombre={servicio.icon} />
              <span className="text-foreground text-sm leading-tight font-medium">
                {servicio.label}
              </span>
            </button>
          )
        })}
      </div>

      {filtrados.length === 0 && !ofrecerCrear ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Ningún servicio coincide con la búsqueda.
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        {seleccionados.size === 0
          ? 'Tocá los servicios realizados en esta visita.'
          : `${seleccionados.size} servicio(s) seleccionados.`}
      </p>
    </div>
  )
}
