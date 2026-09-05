'use client'

import imageCompression from 'browser-image-compression'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AvisoSinUbicar, type SinUbicar } from '@/components/mapa/aviso-sin-ubicar'
import { FichaMapa, TOPES, TOPE_QUE_SIGUE_EL_MAPA } from '@/components/mapa/ficha-mapa'
import { PanelDibujo, type DatosDibujo } from '@/components/mapa/panel-dibujo'
import { PanelImagen } from '@/components/mapa/panel-imagen'
import { esClaveColor, type ClaveColor, type Forma } from '@/lib/anotaciones'
import { OPACIDAD_POR_DEFECTO, esEsquinas, type Esquinas } from '@/lib/imagen-mapa'
import { describirFalloDeFirma } from '@/lib/subidas'
import { destinoDeColocacion, type ModoColocacion } from '@/lib/colocacion-mapa'
import {
  borrarAnotacionAction,
  guardarAnotacionAction,
} from '@/server/actions/anotaciones'
import { guardarImagenMapaAction } from '@/server/actions/imagenes-mapa'
import type { AnotacionMapa, ImagenMapa } from '@/server/queries/farms'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarcadorMapa } from '@/server/queries/farms'

/**
 * maplibre-gl solo existe en el cliente (toca window y WebGL al importarse) y
 * pesa lo suyo, así que entra por dynamic con ssr apagado. Mientras baja se
 * muestra un esqueleto, no una pantalla en blanco.
 */
type Dibujando = {
  forma: Forma
  /** De qué cuelga. Los dos en null es un punto suelto, que es válido. */
  farmId: string | null
  wellId: string | null
  /** Si viene, se está editando un dibujo que ya existe. */
  id?: string
  puntos: [number, number][]
}

const Mapa = dynamic(() => import('@/components/mapa/mapa').then((m) => m.Mapa), {
  ssr: false,
  loading: () => (
    <div className="relative h-full w-full">
      <Skeleton className="h-full w-full rounded-none" />
      <p
        role="status"
        className="text-muted-foreground absolute inset-x-0 bottom-6 text-center text-sm"
      >
        Cargando el mapa…
      </p>
    </div>
  ),
})

type Colocando = {
  modo: ModoColocacion
  farmId?: string
  wellId?: string
  lat: number
  lon: number
  /** Qué se está ubicando, para decírselo al usuario mientras apunta. */
  quePunto: string
  /** No hay punto de partida: se coloca sobre lo que el usuario esté mirando. */
  sinPunto?: boolean
}

export function VistaMapa({
  marcadores,
  anotaciones,
  imagenes,
  sinUbicar,
  puedeMarcarSueltos,
  puedeCalzarImagen = false,
  puntoInicial,
  modo,
  fincaAColocar,
  pozoAColocar,
  borrador,
}: {
  marcadores: MarcadorMapa[]
  anotaciones: AnotacionMapa[]
  /** Las imágenes ya calzadas sobre el terreno. */
  imagenes: ImagenMapa[]
  sinUbicar: SinUbicar[]
  /** Si el actor puede marcar referencias que no cuelgan de ninguna finca. */
  puedeMarcarSueltos: boolean
  /** Si el actor puede calzar imágenes sobre el terreno. Solo el admin. */
  puedeCalzarImagen?: boolean
  /** Id de finca o pozo con el que abrir el mapa ya encuadrado. */
  puntoInicial?: string
  /** Si viene, el mapa abre directo en modo colocación. */
  modo?: ModoColocacion
  /** La finca: dueña del pozo que se coloca, o la que se está editando. */
  fincaAColocar?: string
  /** Si se está corrigiendo un pozo que ya existe, su id. */
  pozoAColocar?: string
  /** Lo que el usuario ya había escrito en el formulario, para devolvérselo. */
  borrador?: Record<string, string>
}) {
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<MarcadorMapa | undefined>(() =>
    marcadores.find((m) => m.id === puntoInicial),
  )
  const [colocando, setColocando] = useState<Colocando | undefined>(() => {
    if (!modo) return undefined

    // El punto de partida es la finca, si ya está ubicada. Una finca nueva no
    // lo está, y un pozo de una finca sin marcar tampoco: en esos casos se
    // coloca sobre lo que el usuario esté mirando, que es mejor que mandarlo
    // al medio de la nada.
    const ancla = marcadores.find((m) => m.id === (pozoAColocar ?? fincaAColocar))

    return {
      modo,
      farmId: fincaAColocar,
      wellId: pozoAColocar,
      lat: ancla?.lat ?? 0,
      lon: ancla?.lon ?? 0,
      quePunto:
        modo === 'finca'
          ? 'la finca'
          : `el pozo${ancla && ancla.tipo === 'finca' ? ` de ${ancla.nombre}` : ''}`,
      sinPunto: ancla === undefined,
    }
  })

  // El tope al que está abierta la ficha. Vive acá y no adentro de ella
  // porque el mapa lo necesita: es cuánta pantalla tiene que descontar para
  // que el punto elegido no quede debajo.
  const [tope, setTope] = useState<number | string | null>(TOPES[0]!)

  const [dibujando, setDibujando] = useState<Dibujando>()
  // Cuando el dibujo está terminado y falta ponerle nombre.
  const [porGuardar, setPorGuardar] = useState<Dibujando>()
  const [guardando, setGuardando] = useState(false)
  const [verAnotaciones, setVerAnotaciones] = useState(true)
  /** Id del dibujo al que hay que ir, elegido desde la lista de la ficha. */
  const [encuadrarDibujo, setEncuadrarDibujo] = useState<string>()

  /**
   * El dibujo al que se le están corriendo los puntos.
   *
   * Guarda TODO el dibujo, no solo la geometría: al terminar hay que volver a
   * guardarlo entero, y el nombre y el color tienen que llegar intactos.
   */
  const [moviendo, setMoviendo] = useState<
    (Dibujando & { etiqueta: string; notas: string; color: ClaveColor; pintado: boolean }) | undefined
  >()

  /**
   * Devuelve la app a los lectores de pantalla al cerrar una ficha.
   *
   * vaul se apoya en Radix, que mientras hay una ficha abierta marca el resto
   * de la página con `aria-hidden` — razonable para un diálogo modal, pero
   * estas fichas NO son modales: el mapa tiene que seguir usable debajo. Y al
   * cerrarse no siempre lo limpia, sobre todo cuando se abre una ficha desde
   * otra. El resultado es que la app entera —mapa, barra de dibujo,
   * navegación— desaparece para quien usa lector de pantalla, sin que se note
   * mirando la pantalla.
   *
   * Se limpia solo cuando no hay ninguna ficha abierta, para no pisar el
   * comportamiento correcto mientras sí la hay.
   */
  const hayFicha = seleccionado !== undefined || porGuardar !== undefined

  useEffect(() => {
    if (hayFicha) return

    // Se vigila el documento entero, no un elemento en particular: vaul marca
    // ancestros distintos según desde dónde se abrió la ficha, y limpiar uno
    // solo dejaba la app oculta igual.
    const limpiar = () => {
      for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
        // Lo que está adentro de una ficha, y los íconos marcados a mano como
        // decorativos, SÍ tienen que seguir ocultos.
        if (el.closest('[data-vaul-drawer]')) continue
        if (el.tagName.toLowerCase() === 'svg') continue
        if (!el.contains(document.querySelector('main'))) continue

        el.removeAttribute('aria-hidden')
      }
    }

    limpiar()

    const vigia = new MutationObserver(limpiar)
    vigia.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden'],
    })

    return () => vigia.disconnect()
  }, [hayFicha])

  // Cada punto nuevo vuelve a abrir en el tope chico: se toca un pozo para
  // ver de qué se trata, no para que la ficha tape el mapa. El reajuste va
  // durante el render y no en un efecto — es estado derivado, y en un efecto
  // encadenaría un render de más por cada punto que se toca.
  const [idPrevio, setIdPrevio] = useState(seleccionado?.id)

  /**
   * El calzado de una imagen.
   *
   * La url es un `blob:` creado acá y hay que revocarlo al terminar: si no, el
   * archivo queda en memoria del navegador toda la visita. Con capturas
   * satelitales, que pesan, eso se nota.
   */
  const [calzando, setCalzando] = useState<{
    url: string
    anchoImagen: number
    altoImagen: number
    nombre: string
    farmId: string
    archivo: File
  }>()
  const [opacidadCalzado, setOpacidadCalzado] = useState(OPACIDAD_POR_DEFECTO)

  /**
   * Las esquinas vienen de un Json, así que se validan antes de dibujar.
   * Una fila con esquinas rotas se saltea en vez de tumbar el mapa entero.
   */
  const imagenesParaElMapa = useMemo(
    () =>
      imagenes
        .filter((i) => esEsquinas(i.esquinas))
        .map((i) => ({
          id: i.id,
          rutaArchivo: i.rutaArchivo,
          esquinas: i.esquinas as Esquinas,
          opacidad: i.opacidad,
        })),
    [imagenes],
  )
  const esquinasActuales = useRef<Esquinas>(undefined)

  const salirDelCalzado = () => {
    setCalzando((actual) => {
      if (actual) URL.revokeObjectURL(actual.url)
      return undefined
    })
    setOpacidadCalzado(OPACIDAD_POR_DEFECTO)
    esquinasActuales.current = undefined
  }

  /**
   * Sube la imagen y guarda dónde quedó.
   *
   * El archivo va primero y la fila después: si se guardara la fila primero y
   * fallara la subida, quedaría un registro apuntando a un archivo que no
   * existe, y el mapa mostraría un hueco sin explicación. Al revés, lo peor
   * que queda es un archivo huérfano en el bucket, que no se ve.
   */
  const guardarImagen = async () => {
    if (!calzando) return

    const esquinas = esquinasActuales.current
    if (!esquinas) {
      toast.error('Todavía no sé dónde quedó la imagen. Mové el mapa y probá de nuevo.')
      return
    }

    setGuardando(true)

    try {
      // 2000px y no los 1600 de un remito: un remito se lee, una imagen del
      // mapa se compara contra el terreno, y ahí el detalle es el punto.
      // Comprimir NO cambia la proporción, así que las esquinas siguen valiendo.
      const comprimida = await imageCompression(calzando.archivo, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 2000,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })

      const firma = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'imagen-mapa',
          farmId: calzando.farmId,
          // La imagen todavía no tiene fila, así que su carpeta se nombra acá.
          recursoId: crypto.randomUUID(),
          mimeType: 'image/jpeg',
        }),
      })

      if (!firma.ok) throw new Error(await describirFalloDeFirma(firma))
      const { signedUrl, ruta } = await firma.json()

      const cuerpo = new FormData()
      cuerpo.append('cacheControl', '3600')
      cuerpo.append('', comprimida)

      const subida = await fetch(signedUrl, { method: 'PUT', body: cuerpo })
      if (!subida.ok) {
        throw new Error(`El servidor de archivos rechazó la imagen (${subida.status}).`)
      }

      const r = await guardarImagenMapaAction({
        farmId: calzando.farmId,
        rutaArchivo: ruta,
        esquinas,
        opacidad: opacidadCalzado,
        etiqueta: calzando.nombre.replace(/\.[^.]+$/, ''),
      })

      if (!r.ok) {
        toast.error(r.error)
        return
      }

      salirDelCalzado()
      toast.success('Imagen guardada sobre el terreno.')
      router.refresh()
    } catch (error) {
      // La causa real: sin esto, un problema de configuración se ve igual que
      // una imagen pesada o una señal mala.
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    } finally {
      setGuardando(false)
    }
  }

  /** Decodifica para saber la proporción: sin ella la imagen entra deformada. */
  const elegirImagen = async (archivo: File, farmId: string) => {
    const url = URL.createObjectURL(archivo)

    try {
      const bitmap = await createImageBitmap(archivo)
      setCalzando({
        url,
        anchoImagen: bitmap.width,
        altoImagen: bitmap.height,
        nombre: archivo.name,
        farmId,
        archivo,
      })
      bitmap.close()
      // La ficha se va: ocupa media pantalla, y calzar es justamente poder
      // mirar el mapa entero.
      setSeleccionado(undefined)
    } catch {
      // Un archivo que el navegador no puede decodificar no es una imagen,
      // por más que la extensión diga que sí.
      URL.revokeObjectURL(url)
      toast.error('No se pudo leer esa imagen. Probá con un JPG o un PNG.')
    }
  }
  if (seleccionado?.id !== idPrevio) {
    setIdPrevio(seleccionado?.id)
    if (seleccionado) setTope(TOPES[0]!)
  }

  return (
    <div className="relative h-full w-full">
      <Mapa
        marcadores={marcadores}
        seleccionado={seleccionado}
        onSeleccion={setSeleccionado}
        encuadrar={anotaciones.find((a) => a.id === encuadrarDibujo)?.puntos}
        onTocarDibujo={(id) => {
          const dibujo = anotaciones.find((a) => a.id === id)
          // Un cliente ve los dibujos pero no los toca: el permiso se decidió
          // en el servidor y acá solo se obedece.
          if (!dibujo || !dibujo.puedeEditar) return

          setSeleccionado(undefined)
          setPorGuardar({
            forma: dibujo.forma,
            farmId: dibujo.farmId,
            wellId: dibujo.wellId,
            id: dibujo.id,
            puntos: dibujo.puntos,
          })
        }}
        imagenesGuardadas={imagenesParaElMapa}
        calzando={calzando}
        opacidadCalzado={opacidadCalzado}
        onEsquinas={(esquinas) => {
          esquinasActuales.current = esquinas
        }}
        anotaciones={anotaciones}
        verAnotaciones={verAnotaciones}
        onVerAnotaciones={setVerAnotaciones}
        dibujando={dibujando}
        moviendo={moviendo}
        onMoverVertice={(indice, punto) =>
          setMoviendo((actual) =>
            actual
              ? { ...actual, puntos: actual.puntos.map((p, i) => (i === indice ? punto : p)) }
              : actual,
          )
        }
        onCancelarForma={() => setMoviendo(undefined)}
        onGuardarForma={async () => {
          if (!moviendo) return

          setGuardando(true)
          const r = await guardarAnotacionAction({
            id: moviendo.id,
            farmId: moviendo.farmId,
            wellId: moviendo.wellId,
            forma: moviendo.forma,
            puntos: moviendo.puntos,
            etiqueta: moviendo.etiqueta,
            notas: moviendo.notas,
            color: moviendo.color,
            pintado: moviendo.pintado,
          })
          setGuardando(false)

          if (!r.ok) {
            toast.error(r.error)
            return
          }

          setMoviendo(undefined)
          toast.success('Puntos movidos')
          router.refresh()
        }}
        onPuntos={(puntos) => setDibujando((actual) => (actual ? { ...actual, puntos } : actual))}
        onTerminarDibujo={() => {
          if (!dibujando) return
          setDibujando(undefined)
          setPorGuardar(dibujando)
        }}
        onCancelarDibujo={() => setDibujando(undefined)}
        puedeMarcarSueltos={puedeMarcarSueltos}
        onMarcarSuelto={() => {
          // Una referencia que no es de nadie: la entrada de un callejón, un
          // cruce, una tranquera sobre la ruta. No cuelga de ninguna finca,
          // así que es interna — el cliente ni la ve.
          setSeleccionado(undefined)
          setVerAnotaciones(true)
          setDibujando({ forma: 'PUNTO', farmId: null, wellId: null, puntos: [] })
        }}
        irAMiUbicacion={puntoInicial === undefined}
        altoFicha={
          seleccionado && typeof tope === 'number'
            ? Math.min(tope, TOPE_QUE_SIGUE_EL_MAPA)
            : 0
        }
        colocando={colocando}
        onCancelarColocacion={() => setColocando(undefined)}
        onColocar={(lat, lon) => {
          // Las coordenadas viajan en la URL y el formulario las levanta ya
          // cargadas. Se redondea a 7 decimales, que es lo que guarda la
          // columna: mandar 15 dígitos sería fingir una precisión que no
          // existe ni en el GPS ni en la base.
          const params = new URLSearchParams({
            ...borrador,
            lat: lat.toFixed(7),
            lon: lon.toFixed(7),
          })
          const c = colocando!
          router.push(`${destinoDeColocacion(c.modo, c.farmId, c.wellId)}?${params}`)
        }}
      />

      {/* Se calla mientras se coloca un punto o se dibuja: son los dos
          momentos en que estorbaría los botones que están abajo. */}
      {colocando || dibujando || moviendo ? null : <AvisoSinUbicar registros={sinUbicar} />}

      {calzando ? (
        <PanelImagen
          nombreArchivo={calzando.nombre}
          opacidad={opacidadCalzado}
          onOpacidad={setOpacidadCalzado}
          guardando={guardando}
          onCancelar={salirDelCalzado}
          onGuardar={() => void guardarImagen()}
        />
      ) : null}

      {porGuardar ? (
        <PanelDibujo
          /* Uno por dibujo: los campos arrancan del estado inicial y solo se
             inicializan al montar. Sin key, tocar otro dibujo con el panel ya
             abierto mostraría el nombre del anterior — y lo guardaría. */
          key={porGuardar.id ?? 'nuevo'}
          forma={porGuardar.forma}
          puntos={porGuardar.puntos.length}
          pertenece={
            anotaciones.find((a) => a.id === porGuardar.id)?.pertenece ??
            marcadores.find((m) => m.id === (porGuardar.wellId ?? porGuardar.farmId))?.nombre ??
            'Punto suelto'
          }
          guardando={guardando}
          inicial={
            porGuardar.id
              ? (() => {
                  const previa = anotaciones.find((a) => a.id === porGuardar.id)
                  return {
                    etiqueta: previa?.etiqueta ?? '',
                    notas: previa?.notas ?? '',
                    color: esClaveColor(previa?.color) ? previa.color : 'rojo',
                    pintado: previa?.pintado ?? false,
                  }
                })()
              : undefined
          }
          onCancelar={() => {
            if (guardando) return
            setPorGuardar(undefined)
          }}
          onMoverPuntos={
            porGuardar.id
              ? () => {
                  const previa = anotaciones.find((a) => a.id === porGuardar.id)
                  if (!previa) return

                  // El panel se va: el mapa tiene que quedar entero para
                  // arrastrar, y los datos vuelven con el dibujo al guardar.
                  setPorGuardar(undefined)
                  setMoviendo({
                    id: previa.id,
                    farmId: previa.farmId,
                    wellId: previa.wellId,
                    forma: previa.forma,
                    puntos: previa.puntos,
                    etiqueta: previa.etiqueta ?? '',
                    notas: previa.notas ?? '',
                    color: esClaveColor(previa.color) ? previa.color : 'rojo',
                    pintado: previa.pintado,
                  })
                }
              : undefined
          }
          onBorrar={
            porGuardar.id
              ? async () => {
                  setGuardando(true)
                  const r = await borrarAnotacionAction(porGuardar.farmId, porGuardar.id!)
                  setGuardando(false)

                  if (!r.ok) {
                    toast.error(r.error)
                    return
                  }

                  setPorGuardar(undefined)
                  toast.success('Dibujo borrado')
                  router.refresh()
                }
              : undefined
          }
          onGuardar={async (datos: DatosDibujo) => {
            setGuardando(true)
            const r = await guardarAnotacionAction({
              id: porGuardar.id,
              farmId: porGuardar.farmId,
              wellId: porGuardar.wellId,
              forma: porGuardar.forma,
              puntos: porGuardar.puntos,
              etiqueta: datos.etiqueta,
              notas: datos.notas,
              color: datos.color,
              pintado: datos.pintado,
            })
            setGuardando(false)

            if (!r.ok) {
              toast.error(r.error)
              return
            }

            setPorGuardar(undefined)
            toast.success('Dibujo guardado')
            // Sin esto el mapa seguiría mostrando el estado anterior: los
            // dibujos vienen del servidor.
            router.refresh()
          }}
        />
      ) : null}

      <FichaMapa
        marcador={seleccionado}
        onCerrar={() => setSeleccionado(undefined)}
        puedeCalzarImagen={puedeCalzarImagen}
        onCalzarImagen={(farmId, archivo) => void elegirImagen(archivo, farmId)}
        tope={tope}
        onTope={setTope}
        dibujosDeLaFinca={
          seleccionado === undefined
            ? []
            : seleccionado.tipo === 'finca'
              ? // Los de la finca, sin los que son de alguno de sus pozos: esos
                // se ven en la ficha del pozo, donde significan algo.
                anotaciones.filter((a) => a.farmId === seleccionado.id && a.wellId === null)
              : anotaciones.filter((a) => a.wellId === seleccionado.id)
        }
        onAbrirDibujo={(id) => {
          const dibujo = anotaciones.find((a) => a.id === id)
          if (!dibujo) return

          setSeleccionado(undefined)
          setVerAnotaciones(true)

          if (dibujo.puedeEditar) {
            setPorGuardar({
              forma: dibujo.forma,
              farmId: dibujo.farmId,
              wellId: dibujo.wellId,
              id: dibujo.id,
              puntos: dibujo.puntos,
            })
          }

          // Se encuadra igual, pueda editarlo o no: verlo en el mapa es la
          // mitad del motivo por el que se toca desde la lista.
          setEncuadrarDibujo(dibujo.id)
        }}
        onDibujar={(de, forma) => {
          // La ficha se va: el mapa tiene que quedar entero para dibujar.
          setSeleccionado(undefined)
          setVerAnotaciones(true)
          setDibujando({ forma, farmId: de.farmId, wellId: de.wellId, puntos: [] })
        }}
        onColocarPozo={(finca) => {
          // La ficha se cierra: el mapa tiene que quedar entero para apuntar.
          setSeleccionado(undefined)
          setColocando({
            modo: 'pozo',
            farmId: finca.farmId,
            lat: finca.lat,
            lon: finca.lon,
            quePunto: `el pozo de ${finca.nombreFinca}`,
          })
        }}
      />
    </div>
  )
}
