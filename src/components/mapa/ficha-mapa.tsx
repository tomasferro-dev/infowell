'use client'

import {
  Building2,
  Droplet,
  MapPin,
  Minus,
  Pentagon,
  Plus,
  SquareArrowOutUpRight,
} from 'lucide-react'
import Link from 'next/link'
import { Drawer } from 'vaul'

import { IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { Button } from '@/components/ui/button'
import { COLORES, esClaveColor, NOMBRE_DE_FORMA, type Forma } from '@/lib/anotaciones'
import type { AnotacionMapa, MarcadorMapa } from '@/server/queries/farms'

/**
 * Las cuatro maneras de dibujar.
 *
 * El rectángulo no es una forma propia —se guarda como perímetro—, pero sí una
 * herramienta propia: dos toques en vez de recorrer el contorno. Es la
 * diferencia entre marcar una finca en cinco segundos y no marcarla nunca.
 */
/**
 * No hay herramienta «Rectángulo».
 *
 * La hubo: dos toques y quedaba la finca marcada a grandes rasgos. Se sacó
 * porque el perímetro hace lo mismo con cuatro toques y un «Listo», y sostener
 * un segundo modo de dibujo —con su bandera propia atravesando el mapa, la
 * ficha y el guardado— costaba más de lo que ahorraba.
 */
const HERRAMIENTAS: {
  forma: Forma
  icono: React.ComponentType<{ className?: string }>
  titulo: string
  detalle: string
}[] = [
  {
    forma: 'PUNTO',
    icono: MapPin,
    titulo: 'Referencia',
    detalle: 'Una entrada, una tranquera, un cruce',
  },
  {
    forma: 'LINEA',
    icono: Minus,
    titulo: 'Línea',
    detalle: 'Un callejón, un canal, una división rápida',
  },
  {
    forma: 'POLIGONO',
    icono: Pentagon,
    titulo: 'Perímetro',
    detalle: 'El contorno de la finca, punto por punto',
  },
]

/**
 * La ficha que sube desde abajo al tocar un punto del mapa.
 *
 * Se arma sobre vaul directamente en vez de reusar el Drawer de shadcn porque
 * ese preset es modal: pone un velo encima y bloquea lo que hay detrás. Acá el
 * mapa TIENE que seguir visible y usable con la ficha abierta — es el punto
 * del feature.
 *
 * Tres topes de arrastre: abre mostrando lo esencial —nombre y primeras filas
 * de datos—, sube al 60% dejando ver el mapa, y sube del todo para leer sin
 * distracciones. En el tope alto tapa el mapa pero NO sale de él: se baja de
 * nuevo y todo queda como estaba, sin perder el punto ni la vista.
 *
 * OJO con el alto del contenido. vaul mueve la ficha con
 * `translate3d(0, ventana − tope × ventana)`, cuenta que asume que el elemento
 * arranca pegado al borde de arriba. Si se le da un alto parcial y se lo ancla
 * abajo, ese desplazamiento se SUMA al que ya trae y la ficha aparece asomando
 * apenas por el borde. Por eso el contenedor va a pantalla completa y quien
 * define lo que se ve es el bloque de adentro, con el alto del tope mayor.
 */

/** Fracciones de pantalla. El mayor manda el alto del bloque de contenido. */
export const TOPES = [0.34, 0.6, 0.96]

/**
 * Más arriba de esto, el encuadre del mapa deja de acompañar.
 *
 * Con la ficha casi tapando todo, descontar su alto dejaría al mapa tratando
 * de meter el punto en una banda de cuatro por ciento: un salto brusco para
 * dejarlo donde igual no se ve. Al subir a leer, el mapa se queda quieto.
 */
export const TOPE_QUE_SIGUE_EL_MAPA = 0.6

export function FichaMapa({
  marcador,
  onCerrar,
  onColocarPozo,
  onDibujar,
  dibujosDeLaFinca,
  onAbrirDibujo,
  tope,
  onTope,
}: {
  marcador: MarcadorMapa | undefined
  onCerrar: () => void
  tope: number | string | null
  onTope: (tope: number | string | null) => void
  onColocarPozo: (finca: {
    farmId: string
    lat: number
    lon: number
    nombreFinca: string
  }) => void
  onDibujar: (de: { farmId: string; wellId: string | null }, forma: Forma) => void
  /** Los dibujos de la finca abierta, para listarlos. */
  dibujosDeLaFinca: AnotacionMapa[]
  /** Abrir uno para verlo, corregirlo o borrarlo. */
  onAbrirDibujo: (id: string) => void
}) {
  const esFinca = marcador?.tipo === 'finca'

  return (
    <Drawer.Root
      open={marcador !== undefined}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
      snapPoints={TOPES}
      activeSnapPoint={tope}
      setActiveSnapPoint={onTope}
      // Sin esto vaul atrapa el foco y el mapa deja de responder al dedo.
      modal={false}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-40 h-full rounded-t-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
          // El aria-describedby vacío evita el warning de Radix por no tener
          // descripción: el contenido de la ficha ES la descripción.
          aria-describedby={undefined}
        >
          {/* El alto es el del tope mayor, no el del contenedor: es lo que
              llega a verse, y todo lo que quede debajo sería espacio muerto. */}
          <div className="flex h-[96vh] flex-col">
          {/* El agarre: la zona ancha de arrastre del borde superior. La
              barrita se ve chica, pero el área que la rodea también arrastra —
              apuntarle a seis píxeles con el pulgar no es razonable. */}
          <div data-agarre="true" className="shrink-0 px-4 pt-2 pb-1.5">
            <div className="bg-muted-foreground/30 mx-auto h-1.5 w-12 rounded-full" />
          </div>

          {marcador ? (
            <>
              <div className="shrink-0 px-4 pt-3 pb-4">
                <div className="flex items-start gap-3">
                  <span
                    className={
                      esFinca
                        ? 'bg-brand/10 text-brand grid size-10 shrink-0 place-items-center rounded-full'
                        : 'grid size-10 shrink-0 place-items-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    }
                  >
                    {esFinca ? <Building2 className="size-5" /> : <Droplet className="size-5" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Drawer.Title className="truncate text-base font-semibold">
                      {marcador.nombre}
                    </Drawer.Title>
                    <p className="text-muted-foreground truncate text-sm">
                      {esFinca
                        ? (marcador.detalle ?? 'Finca')
                        : `${marcador.nombreFinca}${marcador.detalle ? ` · ${marcador.detalle}` : ''}`}
                    </p>
                  </div>
                </div>

                <dl className="bg-muted/40 mt-4 grid grid-cols-2 divide-x rounded-md border">
                  <Dato
                    etiqueta={esFinca ? 'Pozos' : 'Intervenciones'}
                    valor={String(marcador.intervenciones)}
                  />
                  {esFinca ? (
                    <Dato
                      etiqueta="Coordenadas"
                      valor={`${marcador.lat.toFixed(5)}, ${marcador.lon.toFixed(5)}`}
                      monoespaciado
                    />
                  ) : (
                    <Dato
                      etiqueta="Última visita"
                      valor={
                        marcador.ultimaVisita
                          ? formatoFecha.format(new Date(marcador.ultimaVisita))
                          : 'Sin visitas'
                      }
                      chico={!marcador.ultimaVisita}
                    />
                  )}
                </dl>
              </div>

              {/* Lo que sigue scrollea dentro de la ficha, no arrastra la ficha. */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
                {/* El estado del pozo va ANTES que las acciones: el técnico
                    abre la ficha para saber cómo está, no para navegar. */}
                {!esFinca && marcador.estado ? (
                  <section className="mb-4">
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      Último estado · {formatoFecha.format(new Date(marcador.estado.medidoEl))}
                    </h3>
                    <dl className="bg-muted/40 grid grid-cols-2 gap-px overflow-hidden rounded-md border">
                      <Medida etiqueta="Profundidad" valor={marcador.estado.profundidadM} unidad="m" />
                      <Medida etiqueta="Nivel estático" valor={marcador.estado.nivelEstaticoM} unidad="m" />
                      <Medida etiqueta="Nivel dinámico" valor={marcador.estado.nivelDinamicoM} unidad="m" />
                      <Medida etiqueta="Caudal" valor={marcador.estado.caudalM3H} unidad="m³/h" />
                    </dl>
                    {marcador.estado.bomba ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Electrobomba: <span className="text-foreground">{marcador.estado.bomba}</span>
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {!esFinca && !marcador.estado ? (
                  <p className="text-muted-foreground mb-4 rounded-md border border-dashed px-3 py-3 text-center text-xs">
                    Todavía no se cargó ninguna medición de este pozo.
                  </p>
                ) : null}

                <div className="space-y-2">
                  {esFinca ? (
                    <>
                      <Accion href={`/fincas/${marcador.farmId}`} icono={SquareArrowOutUpRight}>
                        Abrir la finca
                      </Accion>
                      {/* No lleva al formulario de una: primero se marca el
                          punto en el mapa. Estando parado en la finca eso es
                          más fiable que el GPS, que puede tardar o errarle. */}
                      <Button
                        type="button"
                        className="h-12 w-full justify-start text-sm"
                        onClick={() =>
                          onColocarPozo({
                            farmId: marcador.farmId,
                            lat: marcador.lat,
                            lon: marcador.lon,
                            nombreFinca: marcador.nombre,
                          })
                        }
                      >
                        <Plus className="size-4" />
                        <span className="flex-1 text-left">Agregar un pozo acá</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Accion
                        href={`/fincas/${marcador.farmId}/pozos/${marcador.id}`}
                        icono={SquareArrowOutUpRight}
                      >
                        Ver historial y estado
                      </Accion>
                      <Accion
                        href={`/fincas/${marcador.farmId}/pozos/${marcador.id}/intervencion/nueva`}
                        icono={Plus}
                        principal
                      >
                        Cargar una intervención
                      </Accion>
                      <Accion href={`/fincas/${marcador.farmId}`} icono={Building2}>
                        Ir a {marcador.nombreFinca}
                      </Accion>
                    </>
                  )}
                </div>

                {/* Los dibujos que ya tiene. Encontrarlos recorriendo el mapa
                    a ojo no es forma: acá están listados y se abren de un
                    toque, aunque estén lejos del encuadre actual. */}
                {dibujosDeLaFinca.length > 0 ? (
                  <section className="mt-5">
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      {esFinca ? 'Dibujos de esta finca' : 'Dibujos de este pozo'}
                    </h3>
                    <ul className="divide-y rounded-md border">
                      {dibujosDeLaFinca.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            onClick={() => onAbrirDibujo(d.id)}
                            className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                          >
                            <span
                              aria-hidden="true"
                              className="size-3 shrink-0 rounded-full border"
                              style={{ background: COLORES[esClaveColor(d.color) ? d.color : 'rojo'] }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {d.etiqueta ?? NOMBRE_DE_FORMA[d.forma]}
                              </span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {NOMBRE_DE_FORMA[d.forma]}
                                {d.notas ? ` · ${d.notas}` : ''}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* Dibujar sobre el mapa. Está tanto en la finca como en el
                    pozo: en una finca grande, «cómo se llega al cabezal» es
                    del pozo y no de la finca entera. */}
                {marcador.puedeDibujar ? (
                  <section className="mt-5">
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      Dibujar en el mapa
                    </h3>
                    <p className="text-muted-foreground mb-3 text-xs">
                      {esFinca
                        ? 'Lo que el mapa no trae: el callejón que no figura, el límite con el vecino, la tranquera buena.'
                        : 'Cómo se llega a este pozo dentro de la finca, o hasta dónde llega lo suyo.'}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {HERRAMIENTAS.map((h) => (
                        <button
                          key={h.titulo}
                          type="button"
                          data-herramienta="true"
                          onClick={() =>
                            onDibujar(
                              {
                                farmId: marcador.farmId,
                                // En la ficha de un pozo, el dibujo es del pozo.
                                wellId: esFinca ? null : marcador.id,
                              },
                              h.forma,
                            )
                          }
                          className="hover:bg-accent focus-visible:ring-ring flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
                        >
                          <h.icono className="text-muted-foreground size-4" />
                          <span className="text-sm font-medium">{h.titulo}</span>
                          <span className="text-muted-foreground text-xs">{h.detalle}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-xs">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  Ubicación marcada con el GPS del teléfono estando en el lugar.
                </p>
              </div>
            </>
          ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

function Dato({
  etiqueta,
  valor,
  monoespaciado,
  chico,
}: {
  etiqueta: string
  valor: string
  monoespaciado?: boolean
  chico?: boolean
}) {
  return (
    <div className="px-3 py-2">
      <dt className="text-muted-foreground text-xs">{etiqueta}</dt>
      <dd
        className={
          monoespaciado
            ? 'font-mono text-xs tabular-nums'
            : chico
              ? 'text-muted-foreground text-sm'
              : 'text-base font-semibold'
        }
      >
        {valor}
      </dd>
    </div>
  )
}

/** Una medición del módulo B. Sin dato se muestra un guion, no un cero. */
function Medida({
  etiqueta,
  valor,
  unidad,
}: {
  etiqueta: string
  valor: number | null
  unidad: string
}) {
  return (
    <div className="bg-card px-3 py-2">
      <dt className="text-muted-foreground text-xs">{etiqueta}</dt>
      <dd className="tabular-nums">
        {valor === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className="font-semibold">{valor}</span>{' '}
            <span className="text-muted-foreground text-xs">{unidad}</span>
          </>
        )}
      </dd>
    </div>
  )
}

function Accion({
  href,
  icono: Icono,
  principal,
  children,
}: {
  href: string
  icono: React.ComponentType<{ className?: string }>
  principal?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      asChild
      variant={principal ? 'default' : 'outline'}
      className="h-12 w-full justify-start text-sm"
    >
      <Link href={href}>
        <Icono className="size-4" />
        <span className="flex-1 text-left">{children}</span>
        <IndicadorEnlace className="size-4" />
      </Link>
    </Button>
  )
}
