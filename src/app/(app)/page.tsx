import { Building2, Camera, Droplet, FileText, Map } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatearMonto } from '@/lib/validation/remito'
import { FlechaOCarga, IndicadorEnlace } from '@/components/layout/indicador-enlace'
import { datosDelInicio, fincasDelCargador } from '@/server/queries/dashboard'

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

const SUBTITULO = {
  ADMIN: 'Vista completa de todas las fincas.',
  CARGADOR: 'Cargá los remitos de las fincas que tenés asignadas.',
  CLIENTE: 'El estado y el historial de tus perforaciones.',
} as const

export default async function InicioPage() {
  const [datos, fincasCargador] = await Promise.all([datosDelInicio(), fincasDelCargador()])

  const sinFincas = datos.fincas === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground text-sm">{SUBTITULO[datos.rol]}</p>
      </div>

      {/* Un usuario sin fincas asignadas no ve nada, y sin este aviso parecería
          que la app está rota en lugar de faltarle un permiso. */}
      {sinFincas && datos.rol !== 'ADMIN' ? (
        <Card className="p-6 text-center">
          <Building2 className="text-muted-foreground mx-auto size-7" />
          <p className="mt-3 font-medium">Todavía no tenés fincas asignadas</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Pedile al administrador que te asigne las que te corresponden.
          </p>
        </Card>
      ) : null}

      {/* El cargador entra a hacer una sola cosa: si tiene una finca, va directo. */}
      {fincasCargador.length === 1 ? (
        <Button asChild className="h-14 w-full text-base">
          <Link href={`/fincas/${fincasCargador[0]!.id}/remitos/nuevo`}>
            <Camera className="size-5" />
            Cargar remito
            <IndicadorEnlace className="size-5" />
          </Link>
        </Button>
      ) : null}

      {/* Panel compacto en vez de tres tarjetas apiladas: en el celular, tres
          cards altas se comen la pantalla entera antes de llegar al contenido
          que el usuario vino a ver. */}
      {/* Los tres conteos arriba y el monto a lo ancho abajo, en un solo
          bloque. El monto no entra en un tercio de una pantalla de 375 px
          —«$ 11.173.500,00» se desbordaba—, y darle la fila entera lo deja
          leerse entero sin achicar la tipografía hasta lo ilegible. */}
      {!sinFincas ? (
        <dl className="bg-card divide-y overflow-hidden rounded-md border">
          <div className="grid grid-cols-3 divide-x">
            <Dato etiqueta={datos.fincas === 1 ? 'Finca' : 'Fincas'} valor={String(datos.fincas)} />
            <Dato etiqueta={datos.pozos === 1 ? 'Pozo' : 'Pozos'} valor={String(datos.pozos)} />
            <Dato
              etiqueta={datos.remitos === 1 ? 'Remito' : 'Remitos'}
              valor={String(datos.remitos)}
            />
          </div>
          <Dato etiqueta="Facturado" valor={formatearMonto(datos.montoTotal)} ancho />
        </dl>
      ) : null}

      {/* Ancho completo y alto de dedo: en el celular es la puerta de entrada
          al mapa, no un enlace más de una lista. */}
      {!sinFincas ? (
        <Button asChild variant="outline" className="h-14 w-full justify-start text-base">
          <Link href="/mapa">
            <Map className="size-5" />
            <span className="flex-1 text-left">Ir al mapa</span>
            <IndicadorEnlace className="size-5" />
          </Link>
        </Button>
      ) : null}

      {datos.ultimasIntervenciones.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Últimos trabajos</h2>

          <ul className="space-y-2">
            {datos.ultimasIntervenciones.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/fincas/${item.pozo.farm.id}/pozos/${item.pozo.id}`}
                  className="hover:bg-accent flex items-center gap-3 rounded-lg border p-3 transition-colors"
                >
                  <Droplet className="text-primary size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.pozo.name}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {item.pozo.farm.name} · {formatoFecha.format(new Date(item.performedAt))}
                    </p>
                    {item.servicios.length > 0 ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {item.servicios.join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <FlechaOCarga />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {datos.ultimosRemitos.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Últimos remitos</h2>

          <ul className="space-y-2">
            {datos.ultimosRemitos.map((remito) => (
              <li key={remito.id}>
                <Link
                  href={`/fincas/${remito.finca.id}/remitos`}
                  className="hover:bg-accent flex items-center gap-3 rounded-lg border p-3 transition-colors"
                >
                  <FileText className="text-muted-foreground size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium tabular-nums">
                      {formatearMonto(remito.amount, remito.currency)}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {remito.finca.name} · {formatoFecha.format(new Date(remito.issueDate))}
                    </p>
                  </div>
                  <FlechaOCarga />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!sinFincas && datos.ultimasIntervenciones.length === 0 && datos.ultimosRemitos.length === 0 ? (
        <Card className="p-6 text-center">
          <Badge variant="secondary" className="mx-auto">
            Sin movimientos
          </Badge>
          <p className="text-muted-foreground mt-3 text-sm">
            Cuando se registren trabajos o remitos, van a aparecer acá.
          </p>
        </Card>
      ) : null}
    </div>
  )
}

/**
 * Una celda del panel de datos.
 *
 * La etiqueta va arriba y chica, el valor abajo y grande: se lee el número
 * primero y se confirma qué es después, que es como se mira un tablero.
 */
function Dato({
  etiqueta,
  valor,
  ancho,
}: {
  etiqueta: string
  valor: string
  /** El monto ocupa la fila entera: es el dato más largo de los cuatro. */
  ancho?: boolean
}) {
  return (
    <div className={ancho ? 'flex items-baseline justify-between px-3 py-2.5' : 'px-3 py-3'}>
      <dt className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {etiqueta}
      </dt>
      <dd className={'font-bold tabular-nums ' + (ancho ? 'text-xl' : 'mt-0.5 text-2xl')}>
        {valor}
      </dd>
    </div>
  )
}
