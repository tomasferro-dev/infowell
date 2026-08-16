'use client'

import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { encontrarDuplicado, filtrarCatalogo } from '@/lib/catalog'
import { toSlug } from '@/lib/slug'
import { cn } from '@/lib/utils'
import type { ResultadoAlta } from '@/server/actions/catalog'

export type OpcionCombobox = { id: string; label: string; slug: string }

/**
 * Selector con búsqueda que además permite crear el elemento en el momento.
 *
 * El valor se publica en un input oculto, así el formulario que lo contiene
 * lo envía como un campo más, sin necesitar estado propio.
 */
export function CreatableCombobox({
  name,
  opciones,
  valorInicial,
  onCrear,
  placeholder = 'Buscar o crear…',
  etiquetaCrear = 'Crear',
  etiqueta,
}: {
  name: string
  opciones: OpcionCombobox[]
  valorInicial?: OpcionCombobox
  /** Server Action que da de alta y devuelve el item creado. */
  onCrear: (nombre: string) => Promise<ResultadoAlta>
  placeholder?: string
  etiquetaCrear?: string
  /** Nombre accesible del control. Sin esto el combobox queda anónimo. */
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [items, setItems] = useState(opciones)
  const [seleccion, setSeleccion] = useState<OpcionCombobox | undefined>(valorInicial)
  const [error, setError] = useState<string>()
  const [creando, iniciarCreacion] = useTransition()

  // El filtrado propio reemplaza al de cmdk, que no ignora acentos: sin esto,
  // "perforacion" no encuentra "Perforación de pozo".
  const filtrados = useMemo(
    () => filtrarCatalogo(items, busqueda, (i) => i.label),
    [items, busqueda],
  )

  // Solo se ofrece crear si lo tipeado no existe ya (comparando por slug).
  const yaExiste = encontrarDuplicado(items, busqueda, (i) => i.slug)
  const puedeCrear = busqueda.trim().length > 0 && !yaExiste

  function crear() {
    const nombre = busqueda.trim()

    iniciarCreacion(async () => {
      setError(undefined)
      const resultado = await onCrear(nombre)

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      const nuevo: OpcionCombobox = {
        id: resultado.item.id,
        label: resultado.item.label,
        // Se recalcula desde el label que devolvió el servidor: es el slug con
        // el que la lista detecta duplicados en los siguientes tipeos.
        slug: toSlug(resultado.item.label),
      }

      setItems((previos) =>
        previos.some((p) => p.id === nuevo.id) ? previos : [...previos, nuevo],
      )
      setSeleccion(nuevo)
      setBusqueda('')
      setAbierto(false)
    })
  }

  return (
    <div className="space-y-2">
      {/* El valor real que viaja en el submit del formulario. */}
      <input type="hidden" name={name} value={seleccion?.id ?? ''} />

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            aria-label={etiqueta}
            className="h-12 w-full justify-between text-base font-normal"
          >
            <span className={cn('truncate', !seleccion && 'text-muted-foreground')}>
              {seleccion?.label ?? placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={busqueda}
              onValueChange={setBusqueda}
              className="text-base"
            />

            <CommandList>
              {filtrados.length === 0 && !puedeCrear ? (
                <CommandEmpty>Sin resultados.</CommandEmpty>
              ) : null}

              {filtrados.length > 0 ? (
                <CommandGroup>
                  {filtrados.map((opcion) => (
                    <CommandItem
                      key={opcion.id}
                      value={opcion.id}
                      onSelect={() => {
                        setSeleccion(opcion)
                        setBusqueda('')
                        setAbierto(false)
                      }}
                      className="text-base"
                    >
                      <Check
                        className={cn(
                          'size-4',
                          seleccion?.id === opcion.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {opcion.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {puedeCrear ? (
                <CommandGroup>
                  <CommandItem onSelect={crear} disabled={creando} className="text-base">
                    {creando ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {etiquetaCrear} «{busqueda.trim()}»
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {seleccion ? (
        <button
          type="button"
          onClick={() => setSeleccion(undefined)}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Quitar selección
        </button>
      ) : null}

      {error ? <p className="text-destructive text-xs font-medium">{error}</p> : null}
    </div>
  )
}
