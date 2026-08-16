'use client'

import { Loader2, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Reproductor de notas de voz.
 *
 * Existe por un motivo concreto: los archivos que produce MediaRecorder NO
 * traen la duración en su cabecera. El reproductor nativo del navegador
 * entonces muestra cualquier cosa —minutos u horas para un audio de dos
 * segundos— porque no puede calcularla hasta terminar de reproducir.
 *
 * Acá la duración no se le pregunta al archivo: se usa la que se midió al
 * grabar y quedó guardada en la base. El audio se reproduce igual de bien; lo
 * único que estaba roto era el número en pantalla.
 */

function formatear(segundos: number): string {
  const seguro = Number.isFinite(segundos) && segundos >= 0 ? Math.floor(segundos) : 0
  const m = Math.floor(seguro / 60)
  const s = seguro % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ReproductorAudio({
  src,
  /** Duración medida al grabar. Si falta, se muestra solo el tiempo corrido. */
  duracionSeg,
}: {
  src: string
  duracionSeg?: number | null
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [sonando, setSonando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [transcurrido, setTranscurrido] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const alAvanzar = () => setTranscurrido(audio.currentTime)
    const alTerminar = () => {
      setSonando(false)
      setTranscurrido(0)
      audio.currentTime = 0
    }
    const alEsperar = () => setCargando(true)
    const alPoder = () => setCargando(false)

    audio.addEventListener('timeupdate', alAvanzar)
    audio.addEventListener('ended', alTerminar)
    audio.addEventListener('waiting', alEsperar)
    audio.addEventListener('canplay', alPoder)

    return () => {
      audio.removeEventListener('timeupdate', alAvanzar)
      audio.removeEventListener('ended', alTerminar)
      audio.removeEventListener('waiting', alEsperar)
      audio.removeEventListener('canplay', alPoder)
    }
  }, [])

  async function alternar() {
    const audio = audioRef.current
    if (!audio) return

    if (sonando) {
      audio.pause()
      setSonando(false)
      return
    }

    try {
      setCargando(true)
      await audio.play()
      setSonando(true)
    } catch {
      setSonando(false)
    } finally {
      setCargando(false)
    }
  }

  const total = duracionSeg ?? 0
  // Sin duración conocida no se inventa una barra: quedaría siempre a cero o
  // saltando, que confunde más que no tenerla.
  const progreso = total > 0 ? Math.min(100, (transcurrido / total) * 100) : 0

  return (
    <div className="bg-background flex items-center gap-3 rounded-md border p-2">
      <audio ref={audioRef} src={src} preload="none" />

      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full"
      >
        {cargando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : sonando ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 translate-x-px" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {total > 0 ? (
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-brand h-full rounded-full transition-[width] duration-200"
              style={{ width: `${progreso}%` }}
            />
          </div>
        ) : null}

        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {formatear(transcurrido)}
          {total > 0 ? ` / ${formatear(total)}` : ''}
        </p>
      </div>
    </div>
  )
}
