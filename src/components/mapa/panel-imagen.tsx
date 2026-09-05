'use client'

import { Check, Loader2, X } from 'lucide-react'
import { Drawer } from 'vaul'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ALTO_PANEL_CALZADO } from '@/lib/imagen-mapa'

/**
 * El panel con el que se calza una imagen sobre el terreno.
 *
 * No tiene manijas para arrastrar, escalar ni rotar, y eso es la decisión de
 * diseño: la imagen está clavada a la pantalla y lo que se mueve es el mapa
 * por debajo. Así las tres transformaciones salen de los gestos que el usuario
 * ya usa todos los días —arrastrar, acercar, girar— y no hay ningún blanco
 * chiquito que apuntar con guantes bajo el sol.
 *
 * Lo único que este panel controla es lo que NO se puede resolver con un
 * gesto: cuánto se transparenta la imagen para ver el satelital debajo.
 */

export function PanelImagen({
  nombreArchivo,
  opacidad,
  onOpacidad,
  guardando,
  onGuardar,
  onCancelar,
}: {
  /** Para que se sepa cuál de las capturas se está calzando. */
  nombreArchivo: string
  opacidad: number
  onOpacidad: (valor: number) => void
  guardando: boolean
  onGuardar: () => void
  onCancelar: () => void
}) {
  const porciento = Math.round(opacidad * 100)

  return (
    <Drawer.Root open onOpenChange={(abierto) => !abierto && onCancelar()} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          data-panel-imagen="true"
          style={{ maxHeight: `${ALTO_PANEL_CALZADO * 100}vh` }}
          className="bg-card fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
          aria-describedby={undefined}
        >
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <div className="bg-muted-foreground/30 mx-auto h-1.5 w-12 rounded-full" />
          </div>

          {/* min-h-0: sin esto un hijo flex NO se encoge por debajo de su
              contenido, así que el panel desborda hacia abajo y los botones del
              pie quedan fuera de la pantalla en vez de que esto scrollee. */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-1 pb-4">
            <div>
              <Drawer.Title className="text-base font-semibold">Calzar la imagen</Drawer.Title>
              {/* La instrucción va acá y no en un cartel aparte: es lo único
                  que hay que saber, y decirlo dos veces es ruido. */}
              <p className="text-muted-foreground text-sm">
                Mové, acercá y girá el mapa hasta que el terreno coincida con la imagen.
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{nombreArchivo}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="imagen-opacidad">
                Cuánto se ve la imagen
                <span className="text-muted-foreground ml-auto font-normal tabular-nums">
                  {porciento}%
                </span>
              </Label>
              {/* Nativo y no un componente: con guantes, la barra del sistema
                  tiene mejor área de toque que cualquier cosa que armemos. */}
              <input
                id="imagen-opacidad"
                type="range"
                min={20}
                max={100}
                step={5}
                value={porciento}
                onChange={(e) => onOpacidad(Number(e.target.value) / 100)}
                aria-label="Cuánto se ve la imagen, en por ciento"
                className="accent-primary focus-visible:ring-ring h-11 w-full cursor-pointer rounded focus-visible:ring-3 focus-visible:outline-none"
              />
              <p className="text-muted-foreground text-xs">
                Bajala para ver el satelital por debajo y comparar.
              </p>
            </div>

          </div>

          {/* Al pie y fuera del scroll: son la única salida del modo. Adentro
              del área que scrollea quedaban cortados cuando el contenido no
              entraba, y el usuario no tenía cómo cancelar. */}
          <div className="bg-card shrink-0 border-t px-4 pt-3 pb-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                disabled={guardando}
                onClick={onCancelar}
              >
                <X className="size-4" />
                Cancelar
              </Button>

              <Button
                type="button"
                className="h-12 flex-1"
                disabled={guardando}
                onClick={onGuardar}
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
