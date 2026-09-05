'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import { Check, Crosshair, Eye, EyeOff, MapPin, Undo2, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import {
  actualizarFuente,
  aGeoJson,
  CAPAS_TOCABLES,
  elevarCapas,
  borradorAGeoJson,
  FUENTE,
  FUENTE_BORRADOR,
  montarCapas,
  mostrarDibujos,
} from '@/components/mapa/capas-dibujo'
import {
  esquinasDeRectangulo,
  montarImagen,
  montarImagenesGuardadas,
  type ImagenGuardada,
  moverImagen,
  opacidadImagen,
  quitarImagen,
  rectanguloParaMapa,
} from '@/components/mapa/capa-imagen'
import { Button } from '@/components/ui/button'
import type { Esquinas } from '@/lib/imagen-mapa'
import { limitesDe, MINIMO_DE_PUNTOS, NOMBRE_DE_FORMA, type Punto } from '@/lib/anotaciones'
import type { AnotacionMapa, MarcadorMapa } from '@/server/queries/farms'

/**
 * La imagen que se está calzando sobre el terreno.
 *
 * `url` es un `blob:` del propio origen (ver capa-imagen.ts). Los tamaños
 * vienen de la imagen ya decodificada: sin ellos no se puede respetar su
 * proporción y la foto entra deformada.
 */
export type Calzando = {
  url: string
  anchoImagen: number
  altoImagen: number
}

/** Lo que se está dibujando o reformando ahora mismo. */
export type Dibujando = {
  forma: AnotacionMapa['forma']
  puntos: Punto[]
  /** Si se está reformando uno que ya existe, su id. */
  id?: string
}

/**
 * El mapa satelital.
 *
 * Se carga con `next/dynamic` desde mapa-cargable.tsx: maplibre-gl pesa unos
 * 200 kB comprimidos y no tiene por qué viajar en el bundle de una app que se
 * usa mayormente para cargar remitos.
 *
 * La imagen sale de MapTiler. Es nítida hasta z17-18 sobre Mendoza; más cerca
 * la interpola. No se fuerza un zoom mayor porque no habría nada nuevo que
 * ver: el GPS del teléfono tiene ±8-10 m de error, así que el detalle
 * sub-métrico no aporta nada operativo.
 */

const CLAVE = process.env.NEXT_PUBLIC_MAPTILER_KEY

/**
 * Dónde está el worker de MapLibre.
 *
 * Sin esto, el mapa se ve pero NADA vectorial funciona: ni un relleno, ni una
 * línea, ni un rótulo, ni una tesela vectorial, ni una tipografía. El raster
 * sigue andando porque no pasa por el worker, así que la imagen satelital se
 * dibuja igual y parece que está todo bien. No hay error, no hay aviso: las
 * capas existen, tienen datos, están arriba de todo y visibles, y no se ven.
 *
 * La causa es que maplibre-gl v6 crea el worker como módulo con una URL
 * relativa a su propio archivo, y esa URL no sobrevive al empaquetado. Se le
 * dice dónde está usando `new URL(..., import.meta.url)`, que es la forma que
 * el bundler sí reconoce y reescribe.
 */
if (typeof window !== 'undefined') {
  // El archivo lo pone scripts/preparar-worker-mapa.mjs, que corre en el build
  // y en postinstall copiándolo del paquete instalado. Referenciarlo desde
  // node_modules —con `new URL(..., import.meta.url)` o similar— no funciona:
  // el bundler no reescribe esa ruta.
  maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
}

/**
 * El estilo se arma acá en vez de pedirle el suyo a MapTiler.
 *
 * Los estilos que sirve MapTiler traen, además del raster satelital, una fuente
 * vectorial con calles y rótulos. Esa parte NUNCA terminaba de cargar —ni una
 * tesela vectorial pedida, ni un error—, y con el estilo a medio cargar
 * MapLibre no dibuja ninguna capa agregada después: los dibujos existían, con
 * sus datos, encima de todo y visibles, y no se veía nada. Tampoco se disparaba
 * `load`, que fue el primer síntoma de esto y que en su momento se esquivó sin
 * llegar a la causa.
 *
 * Un estilo propio con una sola fuente no tiene nada que quedarse a medias. Se
 * pierden los rótulos de calles del mapa base, que en el campo casi no existen;
 * lo que sí hay son los que carga el usuario, y esos ahora se ven.
 */
function estiloSatelital(clave: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    // Las etiquetas de los dibujos son capas de símbolos y necesitan glifos.
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${clave}`,
    sources: {
      satelital: {
        type: 'raster',
        tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${clave}`],
        tileSize: 512,
        maxzoom: 20,
        // La atribución es obligatoria por licencia, no decorativa.
        attribution:
          '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a>',
      },
    },
    layers: [{ id: 'satelital', type: 'raster', source: 'satelital' }],
  }
}

/** Mendoza capital: el encuadre de respaldo cuando no hay nada que mostrar. */
const CENTRO_POR_DEFECTO: [number, number] = [-68.8458, -32.8895]

/**
 * Desde acá se muestran los pozos.
 *
 * Un pozo está a decenas de metros del casco de su finca, así que de lejos los
 * pines se pisan y ninguno se puede tocar. De lejos se ven las fincas; al
 * acercarse aparecen sus pozos. Es lo que hace cualquier mapa con puntos
 * anidados, y es lo que el usuario ya espera.
 */
const ZOOM_POZOS = 13

/** Zoom al que se coloca un pozo: suficiente para apuntar al cabezal. */
const ZOOM_COLOCAR = 17

/**
 * Dónde quedó el mapa la última vez, dentro de esta sesión.
 *
 * La primera vez conviene arrancar en la ubicación del usuario. Pero yendo y
 * viniendo entre el mapa y los formularios, volver a pedir el GPS y saltar a
 * otro lado cada vez es desorientador: el usuario venía mirando una finca y de
 * golpe está en otra parte. Se guarda la vista y se vuelve ahí.
 *
 * En sessionStorage y no en localStorage a propósito: si cierra la app y la
 * abre al otro día, en otra finca, arrancar donde está parado vuelve a ser lo
 * correcto.
 */
const CLAVE_VISTA = 'infowell:mapa:vista'

type Vista = { lon: number; lat: number; zoom: number; pitch: number; bearing: number }

function leerVista(): Vista | undefined {
  try {
    const crudo = sessionStorage.getItem(CLAVE_VISTA)
    if (!crudo) return undefined

    const v = JSON.parse(crudo) as Partial<Vista>
    // Se valida antes de usar: lo de sessionStorage puede estar corrupto o
    // venir de una versión anterior, y un NaN en el centro rompe el mapa.
    const numeros = [v.lon, v.lat, v.zoom, v.pitch, v.bearing]
    if (!numeros.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
    if (Math.abs(v.lat!) > 90 || Math.abs(v.lon!) > 180) return undefined

    return v as Vista
  } catch {
    // Modo incógnito y algunos navegadores tiran al tocar sessionStorage.
    return undefined
  }
}

function guardarVista(mapa: maplibregl.Map) {
  try {
    const c = mapa.getCenter()
    sessionStorage.setItem(
      CLAVE_VISTA,
      JSON.stringify({
        lon: c.lng,
        lat: c.lat,
        zoom: mapa.getZoom(),
        pitch: mapa.getPitch(),
        bearing: mapa.getBearing(),
      } satisfies Vista),
    )
  } catch {
    // Si no se puede guardar, el mapa sigue andando: solo pierde la memoria.
  }
}

export function Mapa({
  marcadores,
  seleccionado,
  onSeleccion,
  onTocarDibujo,
  encuadrar,
  colocando,
  onColocar,
  onCancelarColocacion,
  puedeMarcarSueltos = false,
  onMarcarSuelto,
  irAMiUbicacion = true,
  altoFicha = 0,
  anotaciones,
  verAnotaciones,
  onVerAnotaciones,
  imagenesGuardadas,
  calzando,
  opacidadCalzado = 0.8,
  onEsquinas,
  dibujando,
  moviendo,
  onMoverVertice,
  onGuardarForma,
  onCancelarForma,
  onPuntos,
  onTerminarDibujo,
  onCancelarDibujo,
}: {
  marcadores: MarcadorMapa[]
  seleccionado?: MarcadorMapa
  onSeleccion: (marcador: MarcadorMapa | undefined) => void
  /** Se tocó un dibujo ya hecho: se abre para corregirlo o borrarlo. */
  onTocarDibujo: (id: string) => void
  /**
   * Un dibujo al que hay que ir, elegido desde la lista de la ficha.
   *
   * Se encuadra entero y no se centra en un punto: un perímetro centrado en su
   * medio puede quedar todo fuera de pantalla si el zoom venía muy cerca.
   */
  encuadrar?: Punto[]
  /** Punto desde donde arranca la colocación, o undefined si no está activa. */
  colocando?: { lat: number; lon: number; quePunto: string; sinPunto?: boolean }
  onColocar: (lat: number, lon: number) => void
  onCancelarColocacion: () => void
  /**
   * Si arranca yendo a la ubicación del usuario.
   *
   * Se apaga cuando el mapa se abrió sobre un punto concreto (`?punto=`): el
   * usuario pidió ESE pozo, no dónde está parado. Además el seguimiento de
   * ubicación recentra solo y le pelearía al encuadre, dejando los pines
   * moviéndose sin parar.
   */
  irAMiUbicacion?: boolean
  /** Si se ofrece marcar una referencia que no cuelga de ninguna finca. */
  puedeMarcarSueltos?: boolean
  onMarcarSuelto?: () => void
  /** Fracción de pantalla que tapa la ficha, para descontarla del encuadre. */
  altoFicha?: number
  anotaciones: AnotacionMapa[]
  verAnotaciones: boolean
  onVerAnotaciones: (ver: boolean) => void
  /** Las imágenes ya guardadas de las fincas que el actor puede ver. */
  imagenesGuardadas?: ImagenGuardada[]
  /** La imagen que se está calzando, o undefined si no hay ninguna. */
  calzando?: Calzando
  opacidadCalzado?: number
  /**
   * Las cuatro esquinas donde quedó la imagen, al SOLTAR el mapa.
   *
   * Al soltar y no durante el arrastre: ahí el evento corre sesenta veces por
   * segundo y no hay estado de React que lo aguante. La imagen sí se mueve en
   * cada cuadro — eso es dibujo, no estado.
   */
  onEsquinas?: (esquinas: Esquinas) => void
  dibujando?: Dibujando
  /**
   * Un dibujo al que se le están corriendo los puntos.
   *
   * Es distinto de `dibujando`: ahí se agregan vértices tocando el mapa; acá
   * se arrastran los que ya están. Reusan la misma capa de borrador, así que
   * nunca pueden estar los dos a la vez.
   */
  moviendo?: Dibujando
  onMoverVertice?: (indice: number, punto: Punto) => void
  onGuardarForma?: () => void
  onCancelarForma?: () => void
  onPuntos: (puntos: Punto[]) => void
  onTerminarDibujo: () => void
  onCancelarDibujo: () => void
}) {
  const contenedor = useRef<HTMLDivElement>(null)

  // El mapa vive en estado y no en un ref: los efectos que le cuelgan cosas
  // necesitan volver a correr cuando se recrea. Con un ref no se enterarían.
  const [mapa, setMapa] = useState<maplibregl.Map>()
  // Las capas de dibujo existen recién cuando el estilo terminó de cargar.
  const [capasListas, setCapasListas] = useState(false)

  // onSeleccion se guarda en un ref: si entrara como dependencia del efecto,
  // cada render del padre destruiría y recrearía el mapa entero. La
  // asignación va en su propio efecto porque escribir un ref durante el
  // render deja al compilador de React sin garantías.
  const alTocarDibujo = useRef(onTocarDibujo)
  const alMoverVertice = useRef(onMoverVertice)
  // Las posiciones al momento de crear las agarraderas. Van por ref para que
  // el efecto no dependa de ellas y no se recreen durante el arrastre.
  const verticesActuales = useRef<Punto[]>([])
  const moviendoActual = useRef(moviendo)
  const alSeleccionar = useRef(onSeleccion)
  const alDibujar = useRef(onPuntos)
  const dibujoActual = useRef(dibujando)
  // Los dibujos, para poder reponerlos si el estilo se recarga.
  const anotacionesActuales = useRef(anotaciones)
  // Por ref: el efecto del calzado no debe recrearse cuando cambia el aviso ni
  // la opacidad — recrearse significa devolver la imagen al centro de la
  // pantalla mientras alguien la está alineando.
  const alEsquinas = useRef(onEsquinas)
  const imagenesActuales = useRef(imagenesGuardadas)
  const opacidadCalzadoActual = useRef(opacidadCalzado)
  useEffect(() => {
    alSeleccionar.current = onSeleccion
    alTocarDibujo.current = onTocarDibujo
    alMoverVertice.current = onMoverVertice
    verticesActuales.current = moviendo?.puntos ?? []
    moviendoActual.current = moviendo
    alDibujar.current = onPuntos
    dibujoActual.current = dibujando
    anotacionesActuales.current = anotaciones
    alEsquinas.current = onEsquinas
    imagenesActuales.current = imagenesGuardadas
    opacidadCalzadoActual.current = opacidadCalzado
  })

  useEffect(() => {
    if (!contenedor.current || !CLAVE) return

    const guardada = leerVista()

    const m = new maplibregl.Map({
      container: contenedor.current,
      style: estiloSatelital(CLAVE),
      center: guardada ? [guardada.lon, guardada.lat] : CENTRO_POR_DEFECTO,
      zoom: guardada?.zoom ?? 8,
      bearing: guardada?.bearing ?? 0,
      // La inclinación es lo que da la sensación de Earth sin traer un motor 3D.
      pitch: guardada?.pitch ?? 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    })

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

    const ubicacion = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    })
    m.addControl(ubicacion, 'top-right')

    // Arranca en la ubicación del usuario, que es lo que se pidió. No cuelga
    // de 'load': ese evento no llega a dispararse cuando React vuelve a montar
    // el componente (StrictMode en desarrollo lo hace siempre), y esperarlo
    // dejaba el mapa mudo. El control necesita un tick para quedar armado, así
    // que trigger() va en el siguiente turno del reloj.
    // Si ya hay una vista guardada, no se pide el GPS: el usuario está yendo
    // y viniendo entre pantallas y saltarle el encuadre sería perderlo.
    const reloj =
      irAMiUbicacion && !guardada ? setTimeout(() => ubicacion.trigger(), 300) : undefined

    // Tocar la imagen (no un marcador) cierra la ficha abierta — salvo
    // mientras se dibuja, donde cada toque agrega un vértice.
    m.on('click', (evento) => {
      // Mientras se corren los puntos, el mapa no escucha: cada toque sería
      // abrir otra cosa en medio del arrastre.
      if (moviendoActual.current) return

      const d = dibujoActual.current

      if (d) {
        const nuevo: Punto = [evento.lngLat.lng, evento.lngLat.lat]
        alDibujar.current([...d.puntos, nuevo])
        return
      }

      /*
       * ¿Se tocó un dibujo?
       *
       * Se pregunta antes de cerrar la ficha: si no, tocar un perímetro se
       * leería como tocar la imagen y no habría forma de abrir un dibujo ya
       * hecho para corregirlo o borrarlo.
       *
       * Se busca en un cuadradito alrededor del dedo y no en el píxel exacto:
       * una línea mide dos píxeles de ancho y nadie le acierta con el pulgar.
       */
      const cerca = 8
      const caja: [maplibregl.PointLike, maplibregl.PointLike] = [
        [evento.point.x - cerca, evento.point.y - cerca],
        [evento.point.x + cerca, evento.point.y + cerca],
      ]

      const capas = CAPAS_TOCABLES.filter((capa) => m.getLayer(capa))
      const tocados = capas.length > 0 ? m.queryRenderedFeatures(caja, { layers: capas }) : []
      const id = tocados[0]?.properties?.id

      if (typeof id === 'string') {
        alTocarDibujo.current(id)
        return
      }

      alSeleccionar.current(undefined)
    })

    /*
     * Las capas de dibujo SÍ dependen del estilo, al revés que los marcadores.
     *
     * Los marcadores son elementos del DOM y se pueden colgar apenas existe el
     * mapa; addSource y addLayer, en cambio, revientan con «Style is not done
     * loading» si el estilo todavía no llegó. Y no se puede esperar el evento
     * 'load' —no se dispara cuando React vuelve a montar el componente—, así
     * que se escucha 'styledata', que llega siempre, y se pregunta.
     *
     * Vuelve a correr si el estilo se recarga: ahí las capas se pierden y hay
     * que volver a colgarlas.
     */
    const montar = () => {
      // No se pregunta isStyleLoaded(): en este mapa nunca da verdadero —la
      // misma razón por la que 'load' tampoco llega—, y esperarlo dejaba las
      // capas sin colgar para siempre, en silencio. Se intenta y, si el estilo
      // todavía no está, se vuelve a intentar en el próximo 'styledata'.
      try {
        montarCapas(m)
      } catch {
        // Todavía no. El próximo evento reintenta.
        return
      }

      // Los datos se reponen SIEMPRE, no solo al crear las capas. 'styledata'
      // dispara muchas veces, y si el estilo se recarga la fuente vuelve a
      // nacer vacía: sin esto, los dibujos desaparecían del mapa sin que nada
      // fallara.
      // Cada vez, no solo al crearlas: el estilo sigue agregando capas
      // después y las taparía.
      elevarCapas(m)

      actualizarFuente(m, FUENTE, aGeoJson(anotacionesActuales.current))
      setCapasListas(true)
    }

    m.on('styledata', montar)
    montar()

    const recordar = () => guardarVista(m)
    m.on('moveend', recordar)
    m.on('zoomend', recordar)

    // Handle para los tests: dibujar se verifica mirando las capas del mapa,
    // y desde afuera no hay otra forma de alcanzarlas.
    ;(window as unknown as { __mapa?: maplibregl.Map; __mapas?: number }).__mapa = m
    ;(window as unknown as { __mapas?: number }).__mapas =
      ((window as unknown as { __mapas?: number }).__mapas ?? 0) + 1

    setMapa(m)

    return () => {
      if (reloj !== undefined) clearTimeout(reloj)
      m.off('styledata', montar)
      setCapasListas(false)
      m.off('moveend', recordar)
      m.off('zoomend', recordar)
      m.remove()
      setMapa(undefined)
    }
    // irAMiUbicacion no entra como dependencia: se decide al abrir el mapa y
    // recrearlo por eso tiraría abajo la vista que el usuario está mirando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Encuadre inicial: todo lo que el usuario puede ver entra en pantalla.
   *
   * Solo la primera vez. Si hay una vista guardada o se pidió un punto
   * concreto, pisarlas sería justamente lo que se quiere evitar.
   */
  const [encuadreInicial] = useState(() => leerVista() === undefined)
  // Una sola vez, de verdad. La lista de marcadores cambia de identidad con
  // cada refresco del servidor —al guardar un dibujo, por ejemplo— y sin esto
  // el mapa reencuadraba y le tiraba la vista al usuario cada vez.
  const yaEncuadro = useRef(false)

  useEffect(() => {
    if (!mapa || yaEncuadro.current) return

    // La bandera se marca ACÁ, antes de decidir si hay algo que encuadrar. El
    // encuadre inicial es un momento, no una condición: si se entró con un
    // punto pedido, ese punto ES el encuadre inicial. Marcarla recién después
    // del fitBounds dejaba la puerta abierta, y al primer refresco del
    // servidor —guardar un dibujo, por ejemplo— el mapa se iba al mazo.
    yaEncuadro.current = true

    if (!encuadreInicial || seleccionado || marcadores.length === 0) return

    const limites = marcadores.reduce(
      (acc, p) => acc.extend([p.lon, p.lat]),
      new maplibregl.LngLatBounds(
        [marcadores[0]!.lon, marcadores[0]!.lat],
        [marcadores[0]!.lon, marcadores[0]!.lat],
      ),
    )

    mapa.fitBounds(limites, { padding: 64, maxZoom: 15, animate: false })
    // seleccionado y encuadreInicial se leen una sola vez, al montar: agregarlos
    // como dependencias reencuadraría el mapa cada vez que se toca un punto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, marcadores])

  /* Los dibujos guardados. */
  useEffect(() => {
    if (!mapa || !capasListas) return
    actualizarFuente(mapa, FUENTE, aGeoJson(anotaciones))
  }, [mapa, capasListas, anotaciones])

  /* El dibujo en curso, que se redibuja con cada toque o cada arrastre. */
  useEffect(() => {
    if (!mapa || !capasListas) return

    const enCurso = dibujando ?? moviendo
    actualizarFuente(
      mapa,
      FUENTE_BORRADOR,
      borradorAGeoJson(enCurso?.forma ?? 'LINEA', enCurso?.puntos ?? []),
    )
  }, [mapa, capasListas, dibujando, moviendo])

  /**
   * Las agarraderas para correr cada punto.
   *
   * Son marcadores arrastrables de MapLibre: la misma maquinaria que los
   * pines, que ya sabe seguir el dedo y convertir a coordenadas.
   *
   * El efecto NO depende de las posiciones, solo de cuántas hay y de qué
   * dibujo: si se recrearan en cada cuadro del arrastre, el marcador
   * desaparecería debajo del dedo a mitad del gesto.
   */
  const cuantosVertices = moviendo?.puntos.length ?? 0

  useEffect(() => {
    if (!mapa || cuantosVertices === 0) return

    const puntos = verticesActuales.current
    const puestos = puntos.map((punto, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'vertice-mapa'
      el.dataset.vertice = String(i)
      el.setAttribute('aria-label', `Punto ${i + 1}`)

      const marcador = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(punto)
        .addTo(mapa)

      // Se avisa durante el arrastre y no solo al soltar: la forma tiene que
      // seguir al dedo, o no se ve qué se está por dejar.
      const avisar = () => {
        const { lng, lat } = marcador.getLngLat()
        alMoverVertice.current?.(i, [lng, lat])
      }
      marcador.on('drag', avisar)
      marcador.on('dragend', avisar)

      return marcador
    })

    return () => {
      for (const m of puestos) m.remove()
    }
  }, [mapa, moviendo?.id, cuantosVertices])

  /* Apagar los dibujos cuando son demasiados. */
  useEffect(() => {
    if (!mapa || !capasListas) return
    mostrarDibujos(mapa, verAnotaciones)
  }, [mapa, capasListas, verAnotaciones])

  /* Mientras se dibuja, el cursor lo dice. */
  useEffect(() => {
    if (!mapa) return
    mapa.getCanvas().style.cursor = dibujando ? 'crosshair' : ''
  }, [mapa, dibujando])

  /* Ir a un dibujo elegido desde la lista, aunque esté lejos del encuadre. */
  useEffect(() => {
    if (!mapa || !encuadrar || encuadrar.length === 0) return

    const { oeste, sur, este, norte } = limitesDe(encuadrar)
    const alto = mapa.getContainer().clientHeight

    mapa.fitBounds(
      [
        [oeste, sur],
        [este, norte],
      ],
      {
        // El relleno de abajo le deja lugar al panel que se abre con él.
        padding: { top: 48, left: 48, right: 48, bottom: Math.round(alto * 0.5) },
        maxZoom: 17,
        duration: 600,
      },
    )
  }, [mapa, encuadrar])

  /* Marcadores. Son elementos del DOM que el mapa posiciona, no capas del
     estilo, así que se pueden colgar apenas existe el mapa. */
  useEffect(() => {
    if (!mapa) return

    const puestos = marcadores.map((punto) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'marcador-mapa'
      el.dataset.tipo = punto.tipo
      el.dataset.id = punto.id
      el.setAttribute(
        'aria-label',
        punto.tipo === 'finca' ? `Finca ${punto.nombre}` : `Pozo ${punto.nombre}`,
      )
      // El rótulo va como texto y no como ícono: diez gotas idénticas sobre
      // una imagen satelital obligan a tocarlas de a una para saber cuál es
      // cuál. textContent y no innerHTML — el nombre de la finca lo escribe
      // un usuario y termina acá adentro.
      el.textContent = punto.etiqueta

      el.addEventListener('click', (evento) => {
        // Mientras se dibuja, un marcador es un lugar más del mapa: el toque
        // pasa de largo y suma un vértice. Si abriera su ficha, no se podría
        // dibujar encima de un pozo — que es justo donde uno quiere marcar el
        // perímetro o la entrada.
        if (dibujoActual.current) return

        // Sin esto el click llega al mapa y cierra la ficha recién abierta.
        evento.stopPropagation()
        alSeleccionar.current(punto)
      })

      return new maplibregl.Marker({ element: el }).setLngLat([punto.lon, punto.lat]).addTo(mapa)
    })

    const acomodarPorZoom = () => {
      const lejos = mapa.getZoom() < ZOOM_POZOS
      for (const marcador of puestos) {
        const el = marcador.getElement()
        el.dataset.oculto = String(lejos && el.dataset.tipo === 'pozo')
      }
    }

    acomodarPorZoom()
    mapa.on('zoom', acomodarPorZoom)

    return () => {
      mapa.off('zoom', acomodarPorZoom)
      for (const marcador of puestos) marcador.remove()
    }
  }, [mapa, marcadores])

  /**
   * Modo colocación.
   *
   * La mira queda fija en el centro y el usuario mueve el mapa por debajo. Es
   * al revés de tocar el punto con el dedo, y es a propósito: el dedo tapa
   * justo lo que hay que mirar, y en un cabezal de pozo de un metro eso es la
   * diferencia entre marcarlo bien y marcar el tinglado de al lado.
   *
   * La lectura se refresca al soltar y no durante el arrastre: durante el
   * arrastre el evento corre a 60 por segundo y nadie lee un número que se
   * mueve así.
   */
  const [centro, setCentro] = useState<{ lat: number; lon: number }>()

  useEffect(() => {
    if (!mapa || !colocando) return

    // Si la finca todavía no está ubicada no hay adónde volar: se coloca sobre
    // lo que el usuario esté mirando, que es mejor que mandarlo al golfo de
    // Guinea, que es donde queda el 0,0.
    mapa.easeTo({
      ...(colocando.sinPunto ? {} : { center: [colocando.lon, colocando.lat] as [number, number] }),
      zoom: Math.max(mapa.getZoom(), ZOOM_COLOCAR),
      padding: { top: 0, left: 0, right: 0, bottom: 0 },
      duration: 600,
    })

    const leerCentro = () => {
      const c = mapa.getCenter()
      setCentro({ lat: c.lat, lon: c.lng })
    }

    leerCentro()
    mapa.on('moveend', leerCentro)

    return () => {
      mapa.off('moveend', leerCentro)
    }
  }, [mapa, colocando])

  /**
   * Las imágenes ya guardadas.
   *
   * Se remontan cuando cambia la lista. La clave del efecto NO es el arreglo:
   * la consulta devuelve uno nuevo en cada render y eso bajaría los archivos
   * otra vez, en cada movimiento del mapa.
   *
   * Pero tampoco alcanza con los ids: cambiarle la opacidad a una imagen deja
   * los ids iguales, y el efecto no volvería a correr — el cambio se guardaba
   * en la base y el mapa seguía mostrando el valor viejo hasta recargar. Por
   * eso la clave lleva también lo que se ve.
   */
  const clavesGuardadas = (imagenesGuardadas ?? [])
    .map((i) => `${i.id}:${i.opacidad}`)
    .join(',')

  useEffect(() => {
    if (!mapa || !capasListas) return

    const lista = imagenesActuales.current ?? []
    if (lista.length === 0) return

    let vigente = true
    let limpiar: (() => void) | undefined

    void montarImagenesGuardadas(mapa, lista, () => vigente).then((quitar) => {
      // Si el efecto se desmontó mientras bajaban los archivos, lo montado
      // hay que sacarlo igual: si no, quedan capas huérfanas al cambiar de
      // vista y se van encimando.
      if (!vigente) {
        quitar()
        return
      }
      limpiar = quitar
      // Los dibujos vuelven arriba: una foto no puede tapar un dibujo.
      elevarCapas(mapa)
    })

    return () => {
      vigente = false
      limpiar?.()
    }
  }, [mapa, capasListas, clavesGuardadas])

  /**
   * Modo calzado.
   *
   * La imagen queda fija a la PANTALLA y el usuario mueve el mapa por debajo.
   * Es el mismo principio que el modo colocación de un pozo, y por la misma
   * razón: si se arrastrara la imagen con el dedo, el dedo taparía justo la
   * referencia contra la que se la está alineando.
   *
   * El regalo de hacerlo así es que las tres transformaciones salen gratis y
   * con gestos que el usuario ya sabe: arrastrar el mapa mueve la imagen
   * contra el terreno, acercar la escala, y girar la gira. Sin manijas
   * diminutas, sin pelear con los gestos del mapa, y funciona igual con
   * guantes que con un mouse.
   */
  const rectanguloCalzado = useRef<{ x: number; y: number; ancho: number; alto: number }>(undefined)

  useEffect(() => {
    // capasListas importa: sin el estilo cargado, addSource revienta con
    // «Style is not done loading» (ver el montaje de las capas de dibujo).
    if (!mapa || !capasListas || !calzando) return

    const r = rectanguloParaMapa(mapa, calzando.anchoImagen, calzando.altoImagen)
    rectanguloCalzado.current = r

    montarImagen(mapa, calzando.url, esquinasDeRectangulo(mapa, r), opacidadCalzadoActual.current)

    // Los dibujos vuelven arriba. Una foto tapando un dibujo sería una
    // regresión que nadie reporta: simplemente el dibujo «no está».
    elevarCapas(mapa)

    // En cada cuadro: es dibujo, no estado.
    const clavar = () => {
      if (rectanguloCalzado.current) {
        moverImagen(mapa, esquinasDeRectangulo(mapa, rectanguloCalzado.current))
      }
    }

    // Al soltar: recién acá sube a React.
    const avisar = () => {
      if (rectanguloCalzado.current) {
        alEsquinas.current?.(esquinasDeRectangulo(mapa, rectanguloCalzado.current))
      }
    }

    mapa.on('move', clavar)
    mapa.on('moveend', avisar)
    avisar()

    return () => {
      mapa.off('move', clavar)
      mapa.off('moveend', avisar)
      rectanguloCalzado.current = undefined
      quitarImagen(mapa)
    }
    // Las medidas y la url, no el objeto: un literal nuevo en cada render
    // remontaría la imagen y la devolvería al centro mientras se la calza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, capasListas, calzando?.url, calzando?.anchoImagen, calzando?.altoImagen])

  /* La opacidad va aparte: cambiarla no debe remontar ni recentrar la imagen. */
  useEffect(() => {
    if (mapa) opacidadImagen(mapa, opacidadCalzado)
  }, [mapa, opacidadCalzado, calzando])

  /* El marcador abierto se resalta, para no perderlo detrás de la ficha. */
  useEffect(() => {
    if (!contenedor.current) return

    for (const el of contenedor.current.querySelectorAll<HTMLElement>('.marcador-mapa')) {
      el.dataset.activo = String(el.dataset.id === seleccionado?.id)
    }
  }, [seleccionado, marcadores, mapa])

  /**
   * Encuadre del punto elegido.
   *
   * Centrarlo a secas lo dejaría justo detrás de la ficha. El `padding` le dice
   * al mapa que el área útil es solo la franja que queda a la vista, y ahí sí
   * el punto queda donde el usuario lo puede ver. Se recalcula al cambiar de
   * tope: si la ficha sube, el mapa acompaña.
   */
  useEffect(() => {
    if (!mapa || colocando) return

    const alto = mapa.getContainer().clientHeight
    const relleno = { top: 0, left: 0, right: 0, bottom: alto * altoFicha }

    if (seleccionado) {
      mapa.easeTo({
        center: [seleccionado.lon, seleccionado.lat],
        zoom: Math.max(mapa.getZoom(), ZOOM_POZOS + 1),
        padding: relleno,
        duration: 600,
      })
    } else {
      mapa.easeTo({ padding: relleno, duration: 300 })
    }
  }, [mapa, seleccionado, colocando, altoFicha])

  if (!CLAVE) {
    return (
      <div className="bg-muted text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        <p>
          Falta <code className="font-mono">NEXT_PUBLIC_MAPTILER_KEY</code>. Sin esa variable no
          se puede pedir la imagen satelital.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={contenedor}
        /* pointer-events-auto no es decorativo: vaul se apoya en Radix, que
           pone `pointer-events: none` en el body mientras la ficha está abierta
           aunque sea no-modal. Sin esto, con la ficha abierta no se puede tocar
           otro marcador ni mover el mapa. Se devuelve solo acá: el resto de la
           página sigue inerte, que es lo que corresponde. */
        className="pointer-events-auto h-full w-full"
        // Los tests esperan a que el mapa exista antes de tocar un marcador.
        data-listo={mapa !== undefined}
      data-alto-ficha={altoFicha}
      data-capas={capasListas}
      data-anotaciones={anotaciones.length}
      />

      {/* Las dos acciones del mapa, juntas y a la derecha. Abajo a la
          izquierda vive el aviso de lo que falta ubicar, y separarlas evita
          que se encimen en una pantalla angosta. */}
      {!dibujando && !colocando && !moviendo && !calzando ? (
        <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex gap-2">
          {/* Una referencia que no es de nadie: la entrada de un callejón, un
              cruce. No hace falta pasar por una finca — muchas veces la
              referencia es justamente para llegar a una que todavía no está
              cargada. */}
          {puedeMarcarSueltos && seleccionado === undefined ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onMarcarSuelto}
              className="pointer-events-auto shadow-md"
            >
              <MapPin className="size-4" />
              Referencia
            </Button>
          ) : null}

          {/* Apagar los dibujos: cuando hay muchos encimados, tapan la imagen
              y estorban más de lo que ayudan. */}
          {anotaciones.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onVerAnotaciones(!verAnotaciones)}
              aria-pressed={!verAnotaciones}
              className="pointer-events-auto shadow-md"
            >
              {verAnotaciones ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {verAnotaciones ? 'Dibujos' : 'Ocultos'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {moviendo ? (
        <>
          {/* El margen derecho le deja lugar a los controles de zoom, que
              viven en esa esquina: a lo ancho completo, el cartel los tapaba. */}
          <div className="pointer-events-none absolute top-16 right-16 left-3 z-20">
            <p className="bg-card/95 rounded-md border px-3 py-2 text-center text-sm shadow-md backdrop-blur">
              Arrastrá cada punto a donde va.
              <span className="text-muted-foreground block text-xs">
                {NOMBRE_DE_FORMA[moviendo.forma]} · {moviendo.puntos.length}{' '}
                {moviendo.puntos.length === 1 ? 'punto' : 'puntos'}
              </span>
            </p>
          </div>

          <div
            data-moviendo="true"
            data-moviendo-puntos={moviendo.puntos.length}
            className="bg-card/95 pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur"
          >
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={onCancelarForma}
            >
              <X className="size-4" />
              Cancelar
            </Button>

            <Button type="button" className="h-12 flex-1" onClick={onGuardarForma}>
              <Check className="size-4" />
              Guardar
            </Button>
          </div>
        </>
      ) : null}

      {dibujando ? (
        <>
          {/* El margen derecho le deja lugar a los controles de zoom, que
              viven en esa esquina: a lo ancho completo, el cartel los tapaba. */}
          <div className="pointer-events-none absolute top-16 right-16 left-3 z-20">
            <p className="bg-card/95 rounded-md border px-3 py-2 text-center text-sm shadow-md backdrop-blur">
              {`Tocá el mapa para marcar ${
                dibujando.forma === 'PUNTO' ? 'la referencia' : 'cada punto'
              }.`}
              <span data-contador-dibujo="true" className="text-muted-foreground block text-xs">
                {NOMBRE_DE_FORMA[dibujando.forma]} · {dibujando.puntos.length}{' '}
                {dibujando.puntos.length === 1 ? 'punto' : 'puntos'}
              </span>
            </p>
          </div>

          <div
            data-dibujando="true"
            className="bg-card/95 pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur"
          >
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={onCancelarDibujo}
            >
              <X className="size-4" />
              Cancelar
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0"
              disabled={dibujando.puntos.length === 0}
              aria-label="Deshacer el último punto"
              onClick={() => onPuntos(dibujando.puntos.slice(0, -1))}
            >
              <Undo2 className="size-4" />
            </Button>

            <Button
              type="button"
              className="h-12 flex-1"
              disabled={dibujando.puntos.length < MINIMO_DE_PUNTOS[dibujando.forma]}
              onClick={onTerminarDibujo}
            >
              <Check className="size-4" />
              Listo
            </Button>
          </div>
        </>
      ) : null}

      {colocando ? (
        <>
          {/* La mira. No intercepta el dedo: el mapa se tiene que poder
              arrastrar tomándolo justo por el centro. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <Crosshair className="size-10 text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
          </div>

          {/* Debajo del botón «Volver», que vive en la misma esquina. */}
          {/* El margen derecho le deja lugar a los controles de zoom, que
              viven en esa esquina: a lo ancho completo, el cartel los tapaba. */}
          <div className="pointer-events-none absolute top-16 right-16 left-3 z-20">
            <p className="bg-card/95 rounded-md border px-3 py-2 text-center text-sm shadow-md backdrop-blur">
              Movés el mapa hasta poner la mira sobre {colocando.quePunto}.
            </p>
          </div>

          <div
            data-colocando="true"
            className="bg-card/95 pointer-events-auto absolute inset-x-0 bottom-0 z-20 space-y-2 border-t p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur"
          >
            <p className="text-muted-foreground text-center font-mono text-xs tabular-nums">
              {centro ? `${centro.lat.toFixed(6)}, ${centro.lon.toFixed(6)}` : '—'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                onClick={onCancelarColocacion}
              >
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-12 flex-1"
                disabled={!centro}
                onClick={() => {
                  if (centro) onColocar(centro.lat, centro.lon)
                }}
              >
                <Check className="size-4" />
                Marcar acá
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
