'use client'

import { Check, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Drawer } from 'vaul'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Editar una imagen ya calzada.
 *
 * Se abre tocándola en la lista de la finca, igual que un dibujo: en esta app,
 * tocar algo hecho lo abre para corregirlo o borrarlo. Que dos cosas parecidas
 * se comporten distinto es lo que obliga a aprender la app dos veces.
 *
 * Acá NO se recalza: mover la imagen es alinearla contra el terreno, y eso se
 * hace mirando el mapa, no un formulario.
 */

export function PanelImagenGuardada({
  etiqueta: etiquetaInicial,
  opacidad: opacidadInicial,
  guardando,
  onGuardar,
  onBorrar,
  onCancelar,
}: {
  etiqueta: string
  opacidad: number
  guardando: boolean
  onGuardar: (datos: { etiqueta: string; opacidad: number }) => void
  onBorrar: () => void
  onCancelar: () => void
}) {
  const [etiqueta, setEtiqueta] = useState(etiquetaInicial)
  const [opacidad, setOpacidad] = useState(opacidadInicial)
  const porciento = Math.round(opacidad * 100)

  return (
    <Drawer.Root open onOpenChange={(abierto) => !abierto && onCancelar()} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          data-panel-imagen-guardada="true"
          className="bg-card fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
          aria-describedby={undefined}
        >
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <div className="bg-muted-foreground/30 mx-auto h-1.5 w-12 rounded-full" />
          </div>

          {/* min-h-0: sin esto el hijo flex no se encoge y los botones del pie
              se van fuera de la pantalla en vez de que esto scrollee. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-4">
            <Drawer.Title className="text-base font-semibold">Imagen del terreno</Drawer.Title>

            <div className="space-y-1.5">
              <Label htmlFor="guardada-etiqueta">Nombre</Label>
              <Input
                id="guardada-etiqueta"
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                maxLength={120}
                placeholder="Vuelo de marzo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guardada-opacidad">
                Cuánto se ve
                <span className="text-muted-foreground ml-auto font-normal tabular-nums">
                  {porciento}%
                </span>
              </Label>
              <input
                id="guardada-opacidad"
                type="range"
                min={20}
                max={100}
                step={5}
                value={porciento}
                onChange={(e) => setOpacidad(Number(e.target.value) / 100)}
                aria-label="Cuánto se ve la imagen, en por ciento"
                className="accent-primary focus-visible:ring-ring h-11 w-full cursor-pointer rounded focus-visible:ring-3 focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="bg-card shrink-0 border-t px-4 pt-3 pb-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-destructive h-12 shrink-0"
                aria-label="Borrar esta imagen"
                disabled={guardando}
                onClick={onBorrar}
              >
                <Trash2 className="size-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                disabled={guardando}
                onClick={onCancelar}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                className="h-12 flex-1"
                disabled={guardando}
                onClick={() => onGuardar({ etiqueta, opacidad })}
              >
                {guardando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
