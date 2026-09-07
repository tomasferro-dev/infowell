'use client'

import { AlertTriangle, CloudUpload, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EVENTO_COLA, pendientes, type RemitoEnCola } from '@/lib/cola-remitos'
import { procesarCola } from '@/lib/enviar-remito'

/**
 * Lo que se cargó sin señal y todavía no subió.
 *
 * Esta barra es la razón de ser de toda la cola. La bitácora difirió la cola
 * justamente porque «si falla en silencio, el operario cree que guardó y no
 * guardó»: una cola sin este aviso sería exactamente ese fallo silencioso, con
 * más código.
 *
 * Por eso está SIEMPRE que haya algo pendiente, en todas las pantallas, y por
 * eso muestra el motivo cuando un remito fue rechazado — ese no va a subir
 * nunca solo, y alguien tiene que enterarse.
 */

export function RemitosPendientes() {
  const router = useRouter()
  const [cola, setCola] = useState<RemitoEnCola[]>([])
  const [subiendo, setSubiendo] = useState(false)

  const releer = useCallback(async () => {
    try {
      setCola(await pendientes())
    } catch {
      // Sin IndexedDB no hay cola. No se avisa acá: el formulario ya avisa al
      // intentar guardar, que es cuando le importa al usuario.
      setCola([])
    }
  }, [])

  const intentar = useCallback(async () => {
    setSubiendo(true)
    try {
      const { enviados } = await procesarCola()
      if (enviados > 0) router.refresh()
    } finally {
      setSubiendo(false)
      await releer()
    }
  }, [releer, router])

  useEffect(() => {
    /*
     * Se reintenta al volver la señal y al volver a la app.
     *
     * NO se usa Background Sync: no existe en Safari de iOS, y el operario usa
     * el teléfono que tiene. Un mecanismo que anda en la mitad de los
     * dispositivos es peor que uno simple que anda en todos, porque nadie sabe
     * en cuál de las dos mitades está parado.
     */
    const alVolverLaRed = () => void intentar()
    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') void intentar()
    }

    // Alguien encoló o sacó algo: hay que releer ya. IndexedDB no avisa solo.
    const alCambiarLaCola = () => void releer()

    window.addEventListener('online', alVolverLaRed)
    window.addEventListener(EVENTO_COLA, alCambiarLaCola)
    document.addEventListener('visibilitychange', alVolverALaApp)

    /*
     * La primera lectura sale de la cola misma, no del render.
     *
     * Con señal se intenta subir —y `intentar` relee al terminar—; sin señal
     * alcanza con leer. Va en un microtask para que el estado se toque después
     * de que el efecto terminó, no durante: si no, la primera pintura y la
     * lectura compiten y React lo marca como cascada de renders.
     */
    queueMicrotask(() => {
      if (navigator.onLine) void intentar()
      else void releer()
    })

    return () => {
      window.removeEventListener('online', alVolverLaRed)
      window.removeEventListener(EVENTO_COLA, alCambiarLaCola)
      document.removeEventListener('visibilitychange', alVolverALaApp)
    }
  }, [intentar, releer])

  if (cola.length === 0) return null

  const rechazado = cola.find((r) => r.ultimoError && r.intentos > 0)

  return (
    <div
      data-remitos-pendientes={cola.length}
      className="bg-card sticky top-0 z-30 border-b px-4 py-2.5"
      // Cambia solo: se anuncia sin robarle el foco a lo que esté haciendo.
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {rechazado ? (
          <AlertTriangle className="text-destructive size-4 shrink-0" />
        ) : (
          <CloudUpload className="text-muted-foreground size-4 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {cola.length === 1 ? '1 remito sin subir' : `${cola.length} remitos sin subir`}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {rechazado
              ? rechazado.ultimoError
              : 'Están guardados en el teléfono. Suben solos cuando haya señal.'}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={rechazado ? 'default' : 'outline'}
          className="h-9 shrink-0"
          disabled={subiendo}
          onClick={() => void intentar()}
        >
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : null}
          {subiendo ? 'Subiendo' : 'Subir ahora'}
        </Button>
      </div>
    </div>
  )
}
