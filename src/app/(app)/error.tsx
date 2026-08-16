'use client'

import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Pantalla de error de la app.
 *
 * Sin esto, un fallo al consultar la base deja la pantalla en blanco o con el
 * error crudo de Next. Para el operario en el campo eso es indistinguible de
 * "la app se rompió"; con esto sabe que puede reintentar y que el problema no
 * es suyo.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Queda en los logs del servidor (Vercel → Logs) para poder diagnosticar.
    console.error('[app] error no controlado', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <TriangleAlert className="size-7" />
      </div>

      <div>
        <h1 className="text-xl font-semibold">No se pudo cargar</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Puede ser un problema de conexión momentáneo. Probá de nuevo; si sigue pasando,
          avisale al administrador.
        </p>
      </div>

      <Button onClick={reset} className="h-12 text-base">
        <RefreshCw className="size-4" />
        Reintentar
      </Button>

      {/* El digest identifica el error en los logs sin exponer el detalle. */}
      {error.digest ? (
        <p className="text-muted-foreground text-xs">Código: {error.digest}</p>
      ) : null}
    </div>
  )
}
