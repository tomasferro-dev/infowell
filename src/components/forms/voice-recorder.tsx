'use client'

import { Loader2, Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ReproductorAudio } from '@/components/data/reproductor-audio'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { describirFalloDeFirma } from '@/lib/subidas'
import { cn } from '@/lib/utils'

/**
 * Grabador de notas de voz. Admite VARIAS por intervención.
 *
 * El punto frágil es el formato: MediaRecorder no soporta lo mismo en todos
 * lados. Chrome y Android graban webm/opus; iOS Safari NO soporta webm y graba
 * mp4. Por eso el tipo se elige preguntando, nunca fijándolo.
 *
 * Cada audio se sube a Storage apenas se termina de grabar, y el formulario
 * solo lleva su referencia: el archivo nunca pasa por la Server Action, que
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

type Nota = {
  id: string
  ruta: string
  mime: string
  duracion: number
  urlLocal: string
}

type Pendiente = { blob: Blob; mime: string; duracion: number; urlLocal: string }

type Estado = 'inicial' | 'grabando' | 'subiendo' | 'error'

export function VoiceRecorder({
  farmId,
  recursoId,
  name = 'voiceNotes',
  maxSegundos = 300,
}: {
  farmId: string
  recursoId: string
  name?: string
  maxSegundos?: number
}) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [estado, setEstado] = useState<Estado>('inicial')
  const [segundos, setSegundos] = useState(0)
  const [mensaje, setMensaje] = useState<string>()
  const [aBorrar, setABorrar] = useState<Nota>()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Marca de tiempo del inicio: la duración se calcula con esto, no contando. */
  const inicioRef = useRef(0)
  /** La última grabación que falló al subir, para poder reintentarla. */
  const pendienteRef = useRef<Pendiente | null>(null)

  const soportado = useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined' &&
      !!elegirFormato(),
    () => true,
  )

  useEffect(() => {
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
  }, [])

  function detenerCronometro() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }

  async function subir(pendiente: Pendiente) {
    pendienteRef.current = pendiente
    setEstado('subiendo')
    setMensaje(undefined)

    try {
      const respuesta = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'nota-voz',
          farmId,
          recursoId,
          mimeType: pendiente.mime,
        }),
      })

      if (!respuesta.ok) throw new Error(await describirFalloDeFirma(respuesta))
      const { signedUrl, ruta } = await respuesta.json()

      // Contrato de uploadToSignedUrl de Supabase: PUT con multipart, donde el
      // archivo va con clave vacía.
      const cuerpo = new FormData()
      cuerpo.append('cacheControl', '3600')
      cuerpo.append('', pendiente.blob)

      const subida = await fetch(signedUrl, { method: 'PUT', body: cuerpo })
      if (!subida.ok) {
        throw new Error(`El servidor de archivos rechazó el audio (${subida.status}).`)
      }

      setNotas((previas) => [
        ...previas,
        {
          id: ruta,
          ruta,
          mime: pendiente.mime,
          duracion: pendiente.duracion,
          urlLocal: pendiente.urlLocal,
        },
      ])
      pendienteRef.current = null
      setEstado('inicial')
      setSegundos(0)
    } catch (error) {
      setEstado('error')
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
      inicioRef.current = Date.now()
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

        // La duración se mide con relojes, no contando intervalos: si el
        // navegador pausa los timers (pantalla apagada, app en segundo plano)
        // el conteo se desfasa del audio real.
        const duracion = Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000))

        void subir({ blob, mime: tipo, duracion, urlLocal: URL.createObjectURL(blob) })
      }

      recorder.start()
      setEstado('grabando')

      intervaloRef.current = setInterval(() => {
        const transcurridos = Math.floor((Date.now() - inicioRef.current) / 1000)
        setSegundos(transcurridos)

        if (transcurridos >= maxSegundos) detener()
      }, 250)
    } catch {
      setEstado('error')
      setMensaje('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  function detener() {
    detenerCronometro()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  /** Reintenta la subida que falló, sin volver a grabar. */
  function reintentar() {
    if (pendienteRef.current) void subir(pendienteRef.current)
  }

  function descartarPendiente() {
    if (pendienteRef.current) URL.revokeObjectURL(pendienteRef.current.urlLocal)
    pendienteRef.current = null
    setEstado('inicial')
    setSegundos(0)
    setMensaje(undefined)
  }

  /** Quita una nota ya subida. Solo se llama desde la confirmación. */
  function borrarNota(nota: Nota) {
    URL.revokeObjectURL(nota.urlLocal)
    setNotas((previas) => previas.filter((n) => n.id !== nota.id))
    setABorrar(undefined)
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
      {/* Cada nota viaja como un único campo JSON: así la ruta, el formato y la
          duración no pueden desalinearse entre sí al llegar al servidor. */}
      {notas.map((nota) => (
        <input
          key={nota.id}
          type="hidden"
          name={name}
          value={JSON.stringify({
            ruta: nota.ruta,
            mime: nota.mime,
            duracion: nota.duracion,
          })}
        />
      ))}

      {notas.length > 0 ? (
        <ul className="space-y-2">
          {notas.map((nota, i) => (
            <li key={nota.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium">
                  Nota {i + 1} · {formatearDuracion(nota.duracion)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setABorrar(nota)}
                  aria-label={`Borrar nota de voz ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <ReproductorAudio src={nota.urlLocal} duracionSeg={nota.duracion} />
            </li>
          ))}
        </ul>
      ) : null}

      {estado === 'inicial' ? (
        <Button type="button" variant="outline" onClick={empezar} className="h-12 w-full text-base">
          <Mic className="size-4" />
          {notas.length === 0 ? 'Grabar nota de voz' : 'Grabar otra nota'}
        </Button>
      ) : null}

      {estado === 'grabando' ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span aria-hidden className="bg-destructive size-3 shrink-0 animate-pulse rounded-full" />
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

      {/* Falló la subida pero la grabación sigue en memoria: se reintenta sin
          volver a hablar. */}
      {estado === 'error' ? (
        <div className="border-destructive space-y-3 rounded-lg border p-3">
          {pendienteRef.current ? (
            <>
              <ReproductorAudio
                src={pendienteRef.current.urlLocal}
                duracionSeg={pendienteRef.current.duracion}
              />
              <div className="flex gap-2">
                <Button type="button" onClick={reintentar} className="h-12 flex-1 text-base">
                  <RotateCcw className="size-4" />
                  Reintentar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={descartarPendiente}
                  className="h-12 text-base"
                >
                  Descartar
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={descartarPendiente}
              className="h-12 w-full text-base"
            >
              Entendido
            </Button>
          )}
        </div>
      ) : null}

      {mensaje ? (
        <p className={cn('text-sm font-medium', estado === 'error' && 'text-destructive')}>
          {mensaje}
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Podés grabar varias notas. Máximo {Math.round(maxSegundos / 60)} minutos cada una.
      </p>

      {/* Confirmación: borrar una nota es irreversible y el botón queda al lado
          del de reproducir, así que un toque de más costaría la grabación. */}
      <AlertDialog open={!!aBorrar} onOpenChange={(abierto) => !abierto && setABorrar(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta nota de voz?</AlertDialogTitle>
            <AlertDialogDescription>
              La grabación se pierde y no se puede recuperar. Vas a tener que volver a grabarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conservarla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aBorrar && borrarNota(aBorrar)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
