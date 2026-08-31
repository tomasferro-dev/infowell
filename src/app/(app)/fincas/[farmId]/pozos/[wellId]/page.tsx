import { ChevronLeft, MapPin, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { GraficoEvolucion } from '@/components/data/grafico-evolucion'
import { PerfilPozo } from '@/components/data/perfil-pozo'
import { FlechaOCarga, IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { TimelinePozo } from '@/components/data/timeline-pozo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { can } from '@/server/guards'
import { numeroDelPozo, obtenerPozo } from '@/server/queries/farms'
import {
  estadoActualDelPozo,
  historialDelPozo,
  seriesDeMediciones,
} from '@/server/queries/interventions'

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' })

/**
 * Slots 1 y 2 de la paleta de datos (azul y naranja), validados aparte para
 * daltonismo. Van por variable y no por hex fijo para que el modo oscuro use
 * sus propios pasos — un hex quemado se apagaría sobre el fondo carbón.
 *
 * Se mantienen fuera de la paleta de marca a propósito: si el caudal fuera
 * rojo competiría con el acento y dejaría de leerse como dato.
 */
const COLOR_ESTATICO = 'var(--chart-1)'
const COLOR_DINAMICO = 'var(--chart-2)'

export default async function PozoPage({
  params,
}: {
  params: Promise<{ farmId: string; wellId: string }>
}) {
  const { farmId, wellId } = await params

  const pozo = await obtenerPozo(farmId, wellId)
  if (!pozo) notFound()

  const [historial, estado, series, numero, puedeEditar, puedeCargar] = await Promise.all([
    historialDelPozo(farmId, wellId),
    estadoActualDelPozo(farmId, wellId),
    seriesDeMediciones(farmId, wellId),
    numeroDelPozo(farmId, wellId),
    can('write', 'well', farmId),
    can('write', 'intervention', farmId),
  ])

  const serieNiveles = [
    {
      nombre: 'Nivel estático',
      color: COLOR_ESTATICO,
      puntos: series
        .filter((s) => s.estatico != null)
        .map((s) => ({ fecha: s.fecha, valor: s.estatico! })),
    },
    {
      nombre: 'Nivel dinámico',
      color: COLOR_DINAMICO,
      puntos: series
        .filter((s) => s.dinamico != null)
        .map((s) => ({ fecha: s.fecha, valor: s.dinamico! })),
    },
  ]

  const serieCaudal = [
    {
      nombre: 'Caudal',
      color: COLOR_ESTATICO,
      puntos: series
        .filter((s) => s.caudal != null)
        .map((s) => ({ fecha: s.fecha, valor: s.caudal! })),
    },
  ]

  const camposEstado = estado
    ? [
        { label: 'Profundidad', valor: estado.depthM, unidad: 'm' },
        { label: 'Altura de bomba', valor: estado.pumpDepthM, unidad: 'm' },
        { label: 'Nivel estático', valor: estado.staticLevelM, unidad: 'm' },
        { label: 'Nivel dinámico', valor: estado.dynamicLevelM, unidad: 'm' },
        { label: 'Diámetro', valor: estado.boreDiameterIn, unidad: '″' },
        { label: 'Caudal', valor: estado.flowRateM3H, unidad: 'm³/h' },
      ].filter((c) => c.valor != null)
    : []

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}`}>
          <ChevronLeft className="size-4" />
          {pozo.farm.name}
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* El mismo número que lleva en el mapa. */}
          {numero === null ? null : (
            <span
              aria-label={`Pozo número ${numero} de la finca`}
              className="bg-primary/10 text-primary mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-base font-bold tabular-nums"
            >
              {numero}
            </span>
          )}
          <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{pozo.name}</h1>
          <p className="text-muted-foreground text-sm">
            {pozo.drilledAt
              ? `Perforado el ${formatoFecha.format(pozo.drilledAt)}`
              : 'Sin fecha de perforación registrada'}
          </p>
          </div>
        </div>

        {puedeEditar ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/fincas/${farmId}/pozos/${wellId}/editar`}>
              <Pencil className="size-4" />
              Editar
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Las coordenadas sueltas no le dicen nada a nadie: llevan al mapa,
          que es donde significan algo. */}
      {pozo.latitude && pozo.longitude ? (
        <Card className="hover:bg-accent transition-colors">
          <CardContent className="p-0">
            <Link
              href={`/mapa?punto=${wellId}`}
              className="flex items-center gap-2 px-6 py-4 text-sm tabular-nums"
            >
              <MapPin className="text-muted-foreground size-4 shrink-0" />
              <span className="flex-1">
                {pozo.latitude.toString()}, {pozo.longitude.toString()}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">Ver en el mapa</span>
              <FlechaOCarga />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {puedeCargar ? (
        <Button asChild className="h-12 w-full text-base">
          <Link href={`/fincas/${farmId}/pozos/${wellId}/intervencion/nueva`}>
            <Plus className="size-4" />
            Nueva intervención
            <IndicadorEnlace />
          </Link>
        </Button>
      ) : null}

      <Tabs defaultValue="historial">
        <TabsList className="w-full">
          <TabsTrigger value="historial" className="flex-1">
            Historial
          </TabsTrigger>
          <TabsTrigger value="estado" className="flex-1">
            Estado
          </TabsTrigger>
          <TabsTrigger value="evolucion" className="flex-1">
            Evolución
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historial">
          <TimelinePozo
            items={historial}
            urlBase={`/fincas/${farmId}/pozos/${wellId}`}
            puedeEditar={puedeCargar}
          />
        </TabsContent>

        <TabsContent value="estado">
          {estado && camposEstado.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Última medición</CardTitle>
                <CardDescription>
                  {formatoFecha.format(new Date(estado.measuredAt))}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {camposEstado.map((campo) => (
                    <div key={campo.label}>
                      <dt className="text-muted-foreground text-xs">{campo.label}</dt>
                      <dd className="text-lg tabular-nums">
                        {campo.valor} <span className="text-muted-foreground text-sm">{campo.unidad}</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                {estado.pump ? (
                  <div>
                    <dt className="text-muted-foreground text-xs">Electrobomba instalada</dt>
                    <dd className="text-sm">{estado.pump.label}</dd>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground text-sm">
                Todavía no se registraron mediciones en este pozo.
              </p>
            </Card>
          )}

          {/* El corte va debajo de las cifras: primero el dato exacto, después
              la lectura de conjunto. */}
          {estado ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Perfil del pozo</CardTitle>
              </CardHeader>
              <CardContent>
                <PerfilPozo
                  mediciones={{
                    depthM: estado.depthM,
                    pumpDepthM: estado.pumpDepthM,
                    staticLevelM: estado.staticLevelM,
                    dynamicLevelM: estado.dynamicLevelM,
                    boreDiameterIn: estado.boreDiameterIn,
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="evolucion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Niveles</CardTitle>
              <CardDescription>
                Profundidad desde la boca del pozo: cuanto más abajo en el gráfico, más hondo
                está el agua.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* invertirY: son profundidades, no alturas. */}
              <GraficoEvolucion series={serieNiveles} unidad="m" invertirY />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Caudal</CardTitle>
              <CardDescription>
                En un gráfico aparte porque es otra unidad: compartir eje con los niveles
                sugeriría relaciones que los datos no respaldan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GraficoEvolucion series={serieCaudal} unidad="m³/h" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {pozo.notes ? (
        <Card>
          <CardContent className="text-sm whitespace-pre-wrap">{pozo.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  )
}
