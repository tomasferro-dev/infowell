'use client'

import { Loader2, Lock, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ResultadoAlta } from '@/server/actions/catalog'

export type ItemAdmin = {
  id: string
  label: string
  isSystem: boolean
  isActive: boolean
  usos: number
}

/**
 * Pantalla de administración compartida por servicios y electrobombas: ambos
 * catálogos se comportan igual (alta, activar/desactivar, nunca borrar).
 *
 * No hay borrado: un servicio referenciado por intervenciones históricas no se
 * puede eliminar sin romper el historial. Desactivar lo saca de las cards
 * futuras y conserva el pasado.
 */
export function CatalogoAdmin({
  items,
  onCrear,
  onAlternar,
  etiquetaSingular,
  placeholder,
}: {
  items: ItemAdmin[]
  onCrear: (nombre: string) => Promise<ResultadoAlta>
  onAlternar: (id: string, activar: boolean) => Promise<void>
  etiquetaSingular: string
  placeholder: string
}) {
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState<string>()
  const [aviso, setAviso] = useState<string>()
  const [pendiente, iniciar] = useTransition()

  function crear() {
    const nombre = nuevo.trim()
    if (!nombre) return

    iniciar(async () => {
      setError(undefined)
      setAviso(undefined)

      const resultado = await onCrear(nombre)

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      // Se avisa si ya existía: sin esto el usuario cree que creó algo nuevo
      // y no entiende por qué la lista no crece.
      setAviso(
        resultado.yaExistia
          ? `«${resultado.item.label}» ya existía; quedó activo.`
          : `«${resultado.item.label}» agregado.`,
      )
      setNuevo('')
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              crear()
            }
          }}
          placeholder={placeholder}
          className="h-12 text-base"
          aria-label={`Nuevo ${etiquetaSingular}`}
        />
        <Button type="button" onClick={crear} disabled={pendiente} className="h-12 shrink-0">
          {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Agregar
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm font-medium">{error}</p> : null}
      {aviso ? <p className="text-muted-foreground text-sm">{aviso}</p> : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-lg border p-3"
            data-inactivo={!item.isActive || undefined}
          >
            <div className="min-w-0 flex-1">
              <p className={item.isActive ? 'font-medium' : 'text-muted-foreground font-medium'}>
                {item.label}
              </p>
              <p className="text-muted-foreground text-xs">
                {item.usos === 0 ? 'Sin usar todavía' : `Usado ${item.usos} vez/veces`}
              </p>
            </div>

            {item.isSystem ? (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Lock className="size-3" />
                Base
              </Badge>
            ) : null}

            {!item.isActive ? (
              <Badge variant="outline" className="shrink-0">
                Inactivo
              </Badge>
            ) : null}

            <AlternarBoton item={item} onAlternar={onAlternar} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AlternarBoton({
  item,
  onAlternar,
}: {
  item: ItemAdmin
  onAlternar: (id: string, activar: boolean) => Promise<void>
}) {
  const [pendiente, iniciar] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await onAlternar(item.id, !item.isActive)))}
      className="shrink-0"
    >
      {pendiente ? (
        <Loader2 className="size-4 animate-spin" />
      ) : item.isActive ? (
        'Desactivar'
      ) : (
        'Activar'
      )}
    </Button>
  )
}
