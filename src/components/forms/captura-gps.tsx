'use client'

import { Crosshair, Loader2, Map, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Captura de coordenadas con el GPS del teléfono.
 *
 * Existe porque nadie va a tipear "-33.0234, -68.8912" a mano: los campos de
 * latitud y longitud estaban en la base desde el principio y jamás se cargó
 * ninguno. La única forma de que existan es que el operario, parado al lado
 * del pozo, toque un botón.
 *
 * NO toma una sola lectura. El GPS de un celular arranca con un error de 40 a
 * 100 metros y va afinando durante varios segundos; quedarse con el primer
 * valor deja el punto a media cuadra. Acá se escucha la señal, se muestra la
 * precisión en vivo y se corta cuando es buena o cuando pasa demasiado tiempo.
 */

/** Precisión que se considera suficiente para dejar de escuchar. */
const PRECISION_OBJETIVO_M = 10

/** Corte por tiempo: más de esto no mejora, solo gasta batería. */
const MAX_ESPERA_MS = 25_000

/** A partir de acá se avisa que el punto puede caer lejos del pozo. */
const PRECISION_DUDOSA_M = 30

type Lectura = { lat: number; lon: number; precision: number }

export function CapturaGps({
  nombreLat = 'latitude',
  nombreLon = 'longitude',
  latInicial,
  lonInicial,
  etiqueta = 'Ubicación',
  ayuda,
  origen,
  onElegirEnMapa,
}: {
  nombreLat?: string
  nombreLon?: string
  latInicial?: string | null
  lonInicial?: string | null
  etiqueta?: string
  ayuda?: string
  /**
   * De dónde salió la ubicación que ya viene cargada. Sin esto diría
   * "Cargada anteriormente" a una coordenada que el usuario acaba de marcar
   * en el mapa hace tres segundos.
   */
  origen?: 'mapa'
  /**
   * Botón para elegir el punto en el mapa, si esta pantalla puede ofrecerlo.
   *
   * El GPS sirve estando parado sobre el pozo. Desde la oficina, o cuando el
   * pozo está a doscientos metros del auto, marcar sobre la imagen satelital
   * es la única forma razonable de cargarlo.
   */
  onElegirEnMapa?: () => void
}) {
  const [lectura, setLectura] = useState<Lectura | undefined>(() =>
    latInicial && lonInicial
      ? { lat: Number(latInicial), lon: Number(lonInicial), precision: 0 }
      : undefined,
  )
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string>()
  const [manual, setManual] = useState(false)

  const watchRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Si el navegador tiene GPS.
   *
   * Con useSyncExternalStore y no con `typeof navigator !== 'undefined'`: esa
   * comparación es una rama servidor/cliente, da distinto en cada lado y hace
   * que React tire el árbol entero y lo vuelva a generar. Es un error que se
   * ve en la consola y no en la pantalla, así que estuvo acá desde que se
   * escribió el componente sin que nadie lo notara.
   *
   * El servidor asume que sí: es lo que evita que el botón aparezca de golpe
   * un instante después de cargar la página.
   */
  const soportado = useSyncExternalStore(
    () => () => {},
    () => 'geolocation' in navigator,
    () => true,
  )

  function detener() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setBuscando(false)
  }

  // Si el usuario se va de la pantalla, no dejamos el GPS prendido.
  useEffect(() => detener, [])

  function buscar() {
    setError(undefined)
    setBuscando(true)

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nueva: Lectura = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          precision: pos.coords.accuracy,
        }

        // Solo se reemplaza si mejora: si no, una lectura mala posterior
        // arruinaría una buena que ya teníamos.
        setLectura((previa) =>
          !previa || previa.precision === 0 || nueva.precision < previa.precision ? nueva : previa,
        )

        if (nueva.precision <= PRECISION_OBJETIVO_M) detener()
      },
      (err) => {
        detener()
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'No diste permiso de ubicación. Activalo en los ajustes del navegador o cargá las coordenadas a mano.'
            : 'No se pudo obtener la ubicación. Probá al aire libre, lejos de galpones o árboles.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: MAX_ESPERA_MS },
    )

    timeoutRef.current = setTimeout(detener, MAX_ESPERA_MS)
  }

  function borrar() {
    detener()
    setLectura(undefined)
    setError(undefined)
  }

  const dudosa = !!lectura && lectura.precision > PRECISION_DUDOSA_M

  return (
    <div className="space-y-2">
      <Label>{etiqueta}</Label>

      {/* Lo que viaja en el submit. Los campos existen siempre, aunque estén
          vacíos: así borrar la ubicación también se guarda. */}
      <input type="hidden" name={nombreLat} value={lectura ? String(lectura.lat) : ''} />
      <input type="hidden" name={nombreLon} value={lectura ? String(lectura.lon) : ''} />

      {lectura ? (
        <div className={cn('space-y-2 rounded-lg border p-3', dudosa && 'border-destructive')}>
          <div className="flex items-start gap-3">
            <MapPin className="text-brand mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm tabular-nums">
                {lectura.lat.toFixed(6)}, {lectura.lon.toFixed(6)}
              </p>
              {lectura.precision > 0 ? (
                <p
                  className={cn(
                    'text-xs',
                    dudosa ? 'text-destructive font-medium' : 'text-muted-foreground',
                  )}
                >
                  Precisión ±{Math.round(lectura.precision)} m
                  {dudosa ? ' — conviene volver a medir al aire libre' : ''}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {origen === 'mapa' ? 'Marcada en el mapa' : 'Cargada anteriormente'}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={borrar}
              aria-label="Quitar ubicación"
              className="shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            {soportado ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={buscar}
                disabled={buscando}
                className="flex-1"
              >
                {buscando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Crosshair className="size-4" />
                )}
                Volver a medir
              </Button>
            ) : null}

            {onElegirEnMapa ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onElegirEnMapa}
                className="flex-1"
              >
                <Map className="size-4" />
                Elegir en el mapa
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!lectura ? (
        <div className="space-y-2">
          {soportado ? (
            <Button
              type="button"
              variant="outline"
              onClick={buscar}
              disabled={buscando}
              className="h-12 w-full text-base"
            >
              {buscando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Crosshair className="size-4" />
              )}
              {buscando ? 'Buscando señal…' : 'Marcar con GPS'}
            </Button>
          ) : null}

          {/* La otra mitad del problema: el GPS solo sirve estando parado
              encima. Marcar sobre la imagen cubre todo lo demás. */}
          {onElegirEnMapa ? (
            <Button
              type="button"
              variant="outline"
              onClick={onElegirEnMapa}
              className="h-12 w-full text-base"
            >
              <Map className="size-4" />
              Elegir en el mapa
            </Button>
          ) : null}
        </div>
      ) : null}

      {buscando ? (
        <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
          Quedate quieto unos segundos: la precisión mejora sola. Se corta al llegar a ±
          {PRECISION_OBJETIVO_M} m.
        </p>
      ) : null}

      {error ? <p className="text-destructive text-sm font-medium">{error}</p> : null}

      {/* Salida manual: para cargar un pozo desde la oficina, con coordenadas
          que vienen de un plano o de otro sistema. */}
      {!manual ? (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Cargar coordenadas a mano
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="gps-lat" className="text-xs">
              Latitud
            </Label>
            <Input
              id="gps-lat"
              inputMode="decimal"
              placeholder="-33.023456"
              defaultValue={lectura?.lat ?? ''}
              onChange={(e) =>
                setLectura((p) => ({
                  lat: Number(e.target.value),
                  lon: p?.lon ?? 0,
                  precision: 0,
                }))
              }
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gps-lon" className="text-xs">
              Longitud
            </Label>
            <Input
              id="gps-lon"
              inputMode="decimal"
              placeholder="-68.891234"
              defaultValue={lectura?.lon ?? ''}
              onChange={(e) =>
                setLectura((p) => ({
                  lat: p?.lat ?? 0,
                  lon: Number(e.target.value),
                  precision: 0,
                }))
              }
              className="h-11 text-base"
            />
          </div>
          <p className="text-muted-foreground col-span-2 text-xs">
            En Argentina las dos son negativas. Usá punto decimal.
          </p>
        </div>
      )}

      {ayuda && !buscando && !error ? (
        <p className="text-muted-foreground text-xs">{ayuda}</p>
      ) : null}
    </div>
  )
}
