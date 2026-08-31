'use client'

import { Check, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Drawer } from 'vaul'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CLAVES_COLOR, COLORES, NOMBRE_DE_FORMA, type ClaveColor, type Forma } from '@/lib/anotaciones'
import { cn } from '@/lib/utils'

/**
 * El panel donde se le pone nombre a un dibujo recién hecho.
 *
 * Aparece DESPUÉS de dibujar y no antes: pedir el nombre primero interrumpe a
 * alguien que está mirando el terreno y todavía no sabe qué va a marcar.
 *
 * El nombre es opcional a propósito. Un perímetro no necesita rótulo; una
 * entrada de callejón sí, y ahí el usuario lo va a escribir sin que se lo
 * exijan.
 */

export type DatosDibujo = {
  etiqueta: string
  notas: string
  color: ClaveColor
  pintado: boolean
}

export function PanelDibujo({
  forma,
  puntos,
  inicial,
  guardando,
  onGuardar,
  onCancelar,
  onBorrar,
}: {
  forma: Forma
  puntos: number
  inicial?: DatosDibujo
  guardando: boolean
  onGuardar: (datos: DatosDibujo) => void
  onCancelar: () => void
  onBorrar?: () => void
}) {
  const [etiqueta, setEtiqueta] = useState(inicial?.etiqueta ?? '')
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [color, setColor] = useState<ClaveColor>(inicial?.color ?? 'rojo')
  const [pintado, setPintado] = useState(inicial?.pintado ?? false)

  return (
    <Drawer.Root open onOpenChange={(abierto) => !abierto && onCancelar()} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          data-panel-dibujo="true"
          className="bg-card fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
          aria-describedby={undefined}
        >
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <div className="bg-muted-foreground/30 mx-auto h-1.5 w-12 rounded-full" />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-2 pb-6">
            <div>
              <Drawer.Title className="text-base font-semibold">
                {inicial ? 'Editar' : 'Guardar'} {NOMBRE_DE_FORMA[forma].toLowerCase()}
              </Drawer.Title>
              <p className="text-muted-foreground text-sm">
                {puntos} {puntos === 1 ? 'punto marcado' : 'puntos marcados'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dibujo-etiqueta">Nombre</Label>
              <Input
                id="dibujo-etiqueta"
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                maxLength={120}
                placeholder={
                  forma === 'PUNTO' ? 'Entrada por el callejón' : 'Límite con el vecino'
                }
              />
              <p className="text-muted-foreground text-xs">
                Opcional, pero es lo que se ve en el mapa sin tocar nada.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dibujo-notas">Cómo se llega</Label>
              <Textarea
                id="dibujo-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Sobre la ruta, doblar a la derecha en el callejón de tierra. No aparece en Google Maps."
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Color</legend>
              <div className="flex gap-2">
                {CLAVES_COLOR.map((clave) => (
                  <button
                    key={clave}
                    type="button"
                    role="radio"
                    aria-checked={color === clave}
                    aria-label={clave}
                    onClick={() => setColor(clave)}
                    style={{ backgroundColor: COLORES[clave] }}
                    className={cn(
                      'size-10 rounded-full border-2 transition-transform',
                      'focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none',
                      color === clave
                        ? 'border-foreground scale-110'
                        : 'border-transparent opacity-70',
                    )}
                  />
                ))}
              </div>
            </fieldset>

            {/* Pintar solo tiene sentido en algo cerrado. */}
            {forma === 'POLIGONO' ? (
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={pintado}
                  onChange={(e) => setPintado(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Pintar por dentro</span>
                  <span className="text-muted-foreground block text-xs">
                    Se reconoce de lejos. Con varias fincas encimadas conviene dejarlo sin
                    pintar.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="flex gap-2 pt-1">
              {onBorrar ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive h-12 shrink-0"
                  aria-label="Borrar este dibujo"
                  disabled={guardando}
                  onClick={onBorrar}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}

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
                onClick={() => onGuardar({ etiqueta, notas, color, pintado })}
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
