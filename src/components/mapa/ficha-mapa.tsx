'use client'

import { Building2, Droplet, MapPin, Plus, SquareArrowOutUpRight } from 'lucide-react'
import Link from 'next/link'
import { Drawer } from 'vaul'

import { IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { Button } from '@/components/ui/button'
import type { MarcadorMapa } from '@/server/queries/farms'

/**
 * La ficha que sube desde abajo al tocar un punto del mapa.
 *
 * Se arma sobre vaul directamente en vez de reusar el Drawer de shadcn porque
 * ese preset es modal: pone un velo encima y bloquea lo que hay detrás. Acá el
 * mapa TIENE que seguir visible y usable con la ficha abierta — es el punto
 * del feature.
 *
 * Altura fija de 70vh: deja siempre 30% de pantalla para el mapa, así el punto
 * que se está mirando nunca queda tapado. No lleva topes intermedios de
 * arrastre a propósito — con ellos vaul abría la ficha apenas asomando por el
 * borde, y de todos modos no hacen falta: se scrollea adentro para ver más y
 * se arrastra el borde superior hacia abajo para cerrar.
 */

export function FichaMapa({
  marcador,
  onCerrar,
}: {
  marcador: MarcadorMapa | undefined
  onCerrar: () => void
}) {
  const esFinca = marcador?.tipo === 'finca'

  return (
    <Drawer.Root
      open={marcador !== undefined}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
      // Sin esto vaul atrapa el foco y el mapa deja de responder al dedo.
      modal={false}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-40 flex h-[70vh] flex-col rounded-t-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
          // El aria-describedby vacío evita el warning de Radix por no tener
          // descripción: el contenido de la ficha ES la descripción.
          aria-describedby={undefined}
        >
          {/* El agarre: la zona ancha de arrastre del borde superior. */}
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />

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
                      <Accion
                        href={`/fincas/${marcador.farmId}/pozos/nuevo`}
                        icono={Plus}
                        principal
                      >
                        Agregar un pozo
                      </Accion>
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

                <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-xs">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  Ubicación marcada con el GPS del teléfono estando en el lugar.
                </p>
              </div>
            </>
          ) : null}
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
