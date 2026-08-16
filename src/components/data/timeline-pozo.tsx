import * as Icons from 'lucide-react'
import { Mic, Pencil, Wrench } from 'lucide-react'
import Link from 'next/link'

import { ReproductorAudio } from '@/components/data/reproductor-audio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { MedicionSerializada } from '@/server/queries/interventions'

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' })
const formatoFechaCorta = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })

export type NotaDeVoz = {
  id: string
  storagePath: string
  durationSec: number | null
  transcript: string | null
}

export type ItemTimeline = {
  id: string
  performedAt: string
  autor: string
  editada: boolean
  editadaEl: string
  servicios: { id: string; name: string; icon: string | null }[]
  medicion: MedicionSerializada | null
  observaciones: { id: string; body: string | null; voiceNotes: NotaDeVoz[] }[]
}

function Icono({ nombre }: { nombre: string | null }) {
  const Componente =
    (nombre &&
      (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nombre]) ||
    Wrench

  return <Componente className="size-3.5" />
}

/** Campos de medición con valor, listos para mostrar. */
function medicionesConValor(m: MedicionSerializada) {
  return [
    { label: 'Profundidad', valor: m.depthM, unidad: 'm' },
    { label: 'Altura de bomba', valor: m.pumpDepthM, unidad: 'm' },
    { label: 'Nivel estático', valor: m.staticLevelM, unidad: 'm' },
    { label: 'Nivel dinámico', valor: m.dynamicLevelM, unidad: 'm' },
    { label: 'Diámetro', valor: m.boreDiameterIn, unidad: '″' },
    { label: 'Caudal', valor: m.flowRateM3H, unidad: 'm³/h' },
  ].filter((c) => c.valor != null)
}

export function TimelinePozo({
  items,
  urlBase,
  puedeEditar = false,
}: {
  items: ItemTimeline[]
  /** Base para armar el enlace de edición: /fincas/x/pozos/y */
  urlBase?: string
  puedeEditar?: boolean
}) {
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Todavía no hay intervenciones registradas en este pozo.
        </p>
      </Card>
    )
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const mediciones = item.medicion ? medicionesConValor(item.medicion) : []

        return (
          <li key={item.id}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatoFecha.format(new Date(item.performedAt))}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {item.autor}
                      {/* Se avisa que el registro se corrigió: el cliente ve
                          estos datos y merece saber que cambiaron. */}
                      {item.editada
                        ? ` · editada el ${formatoFechaCorta.format(new Date(item.editadaEl))}`
                        : ''}
                    </p>
                  </div>

                  {puedeEditar && urlBase ? (
                    <Button asChild variant="ghost" size="sm" className="-mt-1 shrink-0">
                      <Link href={`${urlBase}/intervencion/${item.id}/editar`}>
                        <Pencil className="size-4" />
                        <span className="sr-only">Editar intervención</span>
                      </Link>
                    </Button>
                  ) : null}
                </div>

                {item.servicios.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.servicios.map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-1">
                        <Icono nombre={s.icon} />
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {mediciones.length > 0 ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    {mediciones.map((c) => (
                      <div key={c.label}>
                        <dt className="text-muted-foreground text-xs">{c.label}</dt>
                        <dd className="tabular-nums">
                          {c.valor} {c.unidad}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {item.medicion?.pump ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground text-xs">Electrobomba: </span>
                    {item.medicion.pump.label}
                  </p>
                ) : null}

                {item.observaciones.map((o) => (
                  <div key={o.id} className="bg-muted/50 space-y-2 rounded-md p-3">
                    {o.body ? <p className="text-sm whitespace-pre-wrap">{o.body}</p> : null}

                    {o.voiceNotes.map((nota, i) => (
                      <div key={nota.id} className="space-y-1">
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <Mic className="size-3" />
                          {o.voiceNotes.length > 1 ? `Nota de voz ${i + 1}` : 'Nota de voz'}
                        </p>
                        {/* La URL no se guarda en la base: se pide por la ruta
                            protegida, que revalida el permiso en cada request.
                            La duración sale de la base, no del archivo: los
                            audios de MediaRecorder no la traen en la cabecera. */}
                        <ReproductorAudio
                          src={`/api/files/notas-voz/${nota.storagePath}`}
                          duracionSeg={nota.durationSec}
                        />
                        {nota.transcript ? (
                          <p className="text-sm whitespace-pre-wrap italic">{nota.transcript}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ol>
  )
}
