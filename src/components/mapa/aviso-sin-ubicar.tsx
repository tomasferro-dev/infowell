'use client'

import { Building2, ChevronRight, Droplet, MapPinOff, X } from 'lucide-react'
import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'

import { FlechaOCarga } from '@/components/layout/indicador-enlace'
import { Button } from '@/components/ui/button'

/**
 * Lo que todavía no está en el mapa.
 *
 * Antes era una franja fija que decía «faltan ubicar 2 registros» y nada más:
 * el usuario se enteraba del problema pero no de cuál era, ni de cómo
 * arreglarlo, ni podía sacársela de encima. Un aviso que no se puede accionar
 * es ruido, y encima tapaba los botones de dibujo.
 *
 * Ahora es una chapita chica que se toca para ver la lista, lleva al
 * formulario de cada uno, y se cierra.
 */

export type SinUbicar = {
  tipo: 'finca' | 'pozo'
  id: string
  nombre: string
  nombreFinca: string
  donde: string
}

/**
 * Que no vuelva a aparecer en esta visita, si el usuario la cerró.
 *
 * Se lee con useSyncExternalStore y no con useState(leer): sessionStorage no
 * existe en el servidor, así que inicializar el estado leyéndolo hace que el
 * servidor renderice una cosa y el cliente otra. React lo detecta como un
 * error de hidratación y vuelve a generar el árbol entero — un problema que se
 * ve en la consola y no en la pantalla, así que pasa desapercibido.
 *
 * `getServerSnapshot` devuelve false: en el servidor el aviso siempre se
 * muestra, y si el usuario lo había cerrado desaparece apenas hidrata.
 */
const CLAVE_OCULTO = 'infowell:mapa:sin-ubicar-oculto'

const suscriptores = new Set<() => void>()

function suscribir(avisar: () => void) {
  suscriptores.add(avisar)
  return () => {
    suscriptores.delete(avisar)
  }
}

function leerOculto() {
  try {
    return sessionStorage.getItem(CLAVE_OCULTO) === '1'
  } catch {
    // Modo incógnito y algunos navegadores tiran al tocar sessionStorage.
    return false
  }
}

function guardarOculto() {
  try {
    sessionStorage.setItem(CLAVE_OCULTO, '1')
  } catch {
    // Si no se puede guardar, se cierra igual: vuelve en la próxima visita.
  }
  for (const avisar of suscriptores) avisar()
}

export function AvisoSinUbicar({ registros }: { registros: SinUbicar[] }) {
  const oculto = useSyncExternalStore(suscribir, leerOculto, () => false)
  const [abierto, setAbierto] = useState(false)

  if (registros.length === 0 || oculto) return null

  function cerrar() {
    setAbierto(false)
    guardarOculto()
  }

  return (
    <div
      data-sin-ubicar="true"
      className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col items-start gap-2"
    >
      {abierto ? (
        <div className="bg-card pointer-events-auto max-h-[45vh] w-full overflow-y-auto rounded-lg border shadow-lg">
          <div className="bg-card sticky top-0 flex items-center gap-2 border-b px-3 py-2">
            <p className="flex-1 text-sm font-medium">Sin ubicar en el mapa</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Cerrar la lista"
              onClick={() => setAbierto(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <ul className="divide-y">
            {registros.map((r) => (
              <li key={`${r.tipo}-${r.id}`}>
                <Link
                  href={r.donde}
                  className="hover:bg-accent flex items-center gap-3 px-3 py-3 transition-colors"
                >
                  {r.tipo === 'finca' ? (
                    <Building2 className="text-muted-foreground size-4 shrink-0" />
                  ) : (
                    <Droplet className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.nombre}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {r.tipo === 'finca'
                        ? 'Marcá la finca y sus pozos entran al mapa'
                        : `Pozo de ${r.nombreFinca}`}
                    </span>
                  </span>
                  <FlechaOCarga />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pointer-events-auto flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shadow-md"
          aria-expanded={abierto}
          onClick={() => setAbierto((a) => !a)}
        >
          <MapPinOff className="size-4" />
          {registros.length === 1 ? '1 sin ubicar' : `${registros.length} sin ubicar`}
          <ChevronRight
            className={abierto ? 'size-4 -rotate-90 transition-transform' : 'size-4 rotate-90 transition-transform'}
          />
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 shadow-md"
          aria-label="No mostrar más este aviso"
          onClick={cerrar}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
