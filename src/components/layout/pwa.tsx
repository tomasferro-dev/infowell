'use client'

import { WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Registro del service worker e indicador de conexión.
 *
 * El indicador importa más de lo que parece: el operario carga remitos en el
 * campo, donde la señal se cae sin aviso. Sin esto, aprieta Guardar, no pasa
 * nada, y no sabe si se guardó o no.
 */

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Se registra después del load para no competir con el primer render.
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Un fallo acá no debe romper la app: la PWA es una mejora, no un
        // requisito para que funcione.
      })
    }

    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })

    return () => window.removeEventListener('load', registrar)
  }, [])

  return null
}

type EstadoConexion = 'con-señal' | 'sin-señal' | 'recuperada'

export function IndicadorDeConexion() {
  const [estado, setEstado] = useState<EstadoConexion>('con-señal')

  /**
   * Todo el estado se cambia DESDE los eventos del navegador, nunca en el
   * cuerpo del efecto: ese es el patrón que React espera para sincronizarse
   * con un sistema externo (y lo que evita renders en cascada).
   *
   * Si la app se abre ya sin señal, el que aparece es el service worker con la
   * página /offline, así que ese caso no necesita cubrirse acá.
   */
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined

    const alPerder = () => {
      if (id) clearTimeout(id)
      setEstado('sin-señal')
    }

    const alVolver = () => {
      setEstado('recuperada')
      // El aviso de vuelta se queda un momento para que el cambio se note.
      id = setTimeout(() => setEstado('con-señal'), 3000)
    }

    window.addEventListener('offline', alPerder)
    window.addEventListener('online', alVolver)

    return () => {
      if (id) clearTimeout(id)
      window.removeEventListener('offline', alPerder)
      window.removeEventListener('online', alVolver)
    }
  }, [])

  if (estado === 'con-señal') return null

  const recuperada = estado === 'recuperada'

  return (
    <div
      role="status"
      aria-live="polite"
      data-estado={estado}
      className={
        // Fijo y arriba del todo: tiene que verse aunque esté scrolleando.
        'fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ' +
        (recuperada ? 'bg-primary text-primary-foreground' : 'bg-destructive text-white')
      }
    >
      {recuperada ? (
        'Conexión restablecida'
      ) : (
        <>
          <WifiOff className="size-4 shrink-0" />
          Sin conexión — no vas a poder guardar hasta que vuelva
        </>
      )}
    </div>
  )
}
