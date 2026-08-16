'use client'

import { Loader2, Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { describirFalloDeFirma } from '@/lib/subidas'
import { cn } from '@/lib/utils'

/**
 * Grabador de nota de voz.
 *
 * El punto frágil es el formato: MediaRecorder no soporta lo mismo en todos
 * lados. Chrome y Android graban webm/opus; iOS Safari NO soporta webm y graba
 * mp4. Por eso el tipo se elige preguntando, nunca fijándolo.
 *
 * El audio se sube a Storage apenas se termina de grabar, y el formulario solo
 * lleva la ruta resultante: así el archivo no pasa por la Server Action, que
 * tiene límite de tamaño.
 */

const FORMATOS_PREFERIDOS = [
  'audio/webm;codecs=opus', // Chrome, Edge, Firefox, Android
  'audio/webm',
  'audio/mp4', // Safari (iOS y macOS)
  'audio/aac',
  'audio/ogg;codecs=opus',
]

function elegirFormato(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined

  return FORMATOS_PREFERIDOS.find(
    (f) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(f),
  )
}

function formatearDuracion(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type Estado = 'inicial' | 'grabando' | 'subiendo' | 'listo' | 'error'

export function VoiceRecorder({
  farmId,
  recursoId,
  /** Máximo razonable para una nota de campo. */
  maxSegundos = 300,
}: {
  farmId: string
  recursoId: string
  maxSegundos?: number
}) {
  const [estado, setEstado] = useState<Estado>('inicial')
  const [segundos, setSegundos] = useState(0)
  const [mensaje, setMensaje] = useState<string>()
  const [urlPrevia, setUrlPrevia] = useState<string>()
  const [subido, setSubido] = useState<{ ruta: string; mime: string; duracion: number }>()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const duracionRef = useRef(0)
  /**
   * La última grabación, guardada para poder reintentar.
   *
   * Si la subida falla por algo del servidor, el técnico ya habló: perder el
   * audio y obligarlo a repetir todo es la peor respuesta posible.
   */
  const grabacionRef = useRef<{ blob: Blob; mime: string; duracion: number } | null>(null)

  /**
   * Detección de soporte sin efecto ni setState: es un valor que solo existe en
   * el cliente. En el servidor se asume soportado para que el HTML coincida y
   * no haya error de hidratación.
   */
  const soportado = useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined' &&
      !!elegirFormato(),
    () => true,
  )

  // Libera la URL del objeto al desmontar: si no, queda el blob en memoria.
  useEffect(() => {
    return () => {
      if (urlPrevia) URL.revokeObjectURL(urlPrevia)
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
  }, [urlPrevia])

  function detenerCronometro() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }

  async function subir(blob: Blob, mime: string, duracion: number) {
    grabacionRef.current = { blob, mime, duracion }
    setEstado('subiendo')
    setMensaje(undefined)

    try {
      const respuesta = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'nota-voz', farmId, recursoId, mimeType: mime }),
      })

      if (!respuesta.ok) throw new Error(await describirFalloDeFirma(respuesta))
      const { signedUrl, ruta } = await respuesta.json()

      // Contrato de uploadToSignedUrl de Supabase: PUT con multipart, donde el
      // archivo va con clave vacía.
      const cuerpo = new FormData()
      cuerpo.append('cacheControl', '3600')
      cuerpo.append('', blob)

      const subida = await fetch(signedUrl, { method: 'PUT', body: cuerpo })
      if (!subida.ok) {
        throw new Error(`El servidor de archivos rechazó el audio (${subida.status}).`)
      }

      setSubido({ ruta, mime, duracion })
      setEstado('listo')
    } catch (error) {
      setEstado('error')
      // La grabación NO se descarta: queda para reintentar sin volver a hablar.
      setMensaje(error instanceof Error ? error.message : 'No se pudo subir la nota de voz.')
    }
  }

  async function empezar() {
    setMensaje(undefined)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = elegirFormato()

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      duracionRef.current = 0
      setSegundos(0)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        // Siempre se cierra el micrófono: si no, el indicador del navegador
        // queda encendido y en el celular consume batería.
        stream.getTracks().forEach((t) => t.stop())

        const tipo = recorder.mimeType || mime || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: tipo })

        setUrlPrevia((previa) => {
          if (previa) URL.revokeObjectURL(previa)
          return URL.createObjectURL(blob)
        })

        void subir(blob, tipo, duracionRef.current)
      }

      recorder.start()
      setEstado('grabando')

      intervaloRef.current = setInterval(() => {
        duracionRef.current += 1
        setSegundos(duracionRef.current)

        if (duracionRef.current >= maxSegundos) detener()
      }, 1000)
    } catch {
      setEstado('error')
      setMensaje('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  function detener() {
    detenerCronometro()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  /** Vuelve a intentar con el audio que ya está grabado, sin regrabar. */
  function reintentar() {
    const grabacion = grabacionRef.current
    if (!grabacion) return

    void subir(grabacion.blob, grabacion.mime, grabacion.duracion)
  }

  function descartar() {
    if (urlPrevia) URL.revokeObjectURL(urlPrevia)
    setUrlPrevia(undefined)
    setSubido(undefined)
    setSegundos(0)
    setEstado('inicial')
    setMensaje(undefined)
    grabacionRef.current = null
  }

  if (!soportado) {
    return (
      <p className="text-muted-foreground text-sm">
        Este navegador no permite grabar audio. Podés escribir la observación en el campo de
        arriba.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Lo que viaja en el submit: solo la referencia, nunca el audio. */}
      {subido ? (
        <>
          <input type="hidden" name="voiceStoragePath" value={subido.ruta} />
          <input type="hidden" name="voiceMimeType" value={subido.mime} />
          <input type="hidden" name="voiceDurationSec" value={subido.duracion} />
        </>
      ) : null}

      {estado === 'inicial' ? (
        <Button
          type="button"
          variant="outline"
          onClick={empezar}
          className="h-12 w-full text-base"
        >
          <Mic className="size-4" />
          Grabar nota de voz
        </Button>
      ) : null}

      {/* Falló la subida pero la grabación sigue en memoria: se reintenta sin
          volver a hablar, y también se puede escuchar mientras tanto. */}
      {estado === 'error' ? (
        <div className="border-destructive space-y-3 rounded-lg border p-3">
          {urlPrevia ? <audio controls src={urlPrevia} className="w-full" /> : null}

          <div className="flex gap-2">
            {grabacionRef.current ? (
              <Button
                type="button"
                onClick={reintentar}
                className="h-12 flex-1 text-base"
              >
                <RotateCcw className="size-4" />
                Reintentar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={descartar}
              className="h-12 text-base"
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

      {estado === 'grabando' ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span
            aria-hidden
            className="bg-destructive size-3 shrink-0 animate-pulse rounded-full"
          />
          <span className="flex-1 tabular-nums" role="timer" aria-live="off">
            {formatearDuracion(segundos)}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={detener}>
            <Square className="size-4" />
            Detener
          </Button>
        </div>
      ) : null}

      {estado === 'subiendo' ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Subiendo la nota de voz…
        </p>
      ) : null}

      {estado === 'listo' && urlPrevia ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">
            Nota de voz lista · {formatearDuracion(subido?.duracion ?? 0)}
          </p>
          <audio controls src={urlPrevia} className="w-full" />
          <Button type="button" variant="ghost" size="sm" onClick={descartar}>
            <Trash2 className="size-4" />
            Descartar y grabar otra
          </Button>
        </div>
      ) : null}

      {mensaje ? (
        <p className={cn('text-sm font-medium', estado === 'error' && 'text-destructive')}>
          {mensaje}
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Máximo {Math.round(maxSegundos / 60)} minutos. Se guarda el audio; la transcripción
        automática queda para más adelante.
      </p>
    </div>
  )
}
