'use client'

import { CalendarClock, Check, ListOrdered, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import type { CriterioNumeracion } from '@/server/queries/ajustes'

/**
 * Con qué criterio se numeran los pozos de cada finca.
 *
 * Se muestra como dos opciones con su explicación y no como un desplegable:
 * la diferencia entre los dos criterios no se entiende por el título, y elegir
 * mal le cambia el número a todos los pozos de todas las fincas.
 */

const OPCIONES = [
  {
    valor: 'carga' as const,
    icono: ListOrdered,
    titulo: 'Por orden de carga',
    detalle:
      'El primero que se cargó en la app es el 1. Todos los pozos tienen número, siempre.',
  },
  {
    valor: 'perforacion' as const,
    icono: CalendarClock,
    titulo: 'Por fecha de perforación',
    detalle:
      'El más antiguo es el 1, sin importar cuándo se cargó. Los pozos sin fecha de perforación quedan al final.',
  },
]

export function NumeracionPozos({
  criterio,
  onGuardar,
}: {
  criterio: CriterioNumeracion
  onGuardar: (criterio: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [elegido, setElegido] = useState<CriterioNumeracion>(criterio)
  const [guardando, empezar] = useTransition()

  function elegir(valor: CriterioNumeracion) {
    if (valor === elegido || guardando) return

    const anterior = elegido
    // Se marca antes de que responda el servidor: la espera con la opción
    // anterior marcada se lee como que el toque no funcionó.
    setElegido(valor)

    empezar(async () => {
      const r = await onGuardar(valor)

      if (!r.ok) {
        setElegido(anterior)
        toast.error(r.error ?? 'No se pudo guardar')
        return
      }

      toast.success('Numeración actualizada')
    })
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">Numeración de los pozos</h2>
        <p className="text-muted-foreground text-sm">
          El número que se ve en el mapa dentro de cada pozo. Se cuenta por finca: cada finca
          empieza de nuevo en 1.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Criterio de numeración de los pozos"
        className="grid gap-2"
      >
        {OPCIONES.map((opcion) => {
          const activo = elegido === opcion.valor

          return (
            <button
              key={opcion.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={guardando}
              onClick={() => elegir(opcion.valor)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                'focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none',
                activo ? 'border-primary bg-accent' : 'hover:bg-accent/50',
                guardando && 'opacity-70',
              )}
            >
              <opcion.icono
                className={cn('mt-0.5 size-5 shrink-0', activo ? 'text-primary' : 'text-muted-foreground')}
              />

              <span className="min-w-0 flex-1">
                <span className="block font-medium">{opcion.titulo}</span>
                <span className="text-muted-foreground block text-sm">{opcion.detalle}</span>
              </span>

              <span className="mt-0.5 shrink-0">
                {activo && guardando ? (
                  <Loader2 className="text-primary size-5 animate-spin" />
                ) : activo ? (
                  <Check className="text-primary size-5" />
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
