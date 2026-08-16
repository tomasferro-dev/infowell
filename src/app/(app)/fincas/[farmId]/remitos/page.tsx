import { ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { GaleriaRemito } from '@/components/data/galeria-remito'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatearMonto } from '@/lib/validation/remito'
import { can } from '@/server/guards'
import { obtenerFinca } from '@/server/queries/farms'
import { listarRemitos } from '@/server/queries/receipts'

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

export default async function RemitosPage({
  params,
}: {
  params: Promise<{ farmId: string }>
}) {
  const { farmId } = await params

  const [finca, datos, puedeCargar] = await Promise.all([
    obtenerFinca(farmId),
    listarRemitos(farmId),
    can('write', 'receipt', farmId),
  ])

  if (!finca) notFound()

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}`}>
          <ChevronLeft className="size-4" />
          {finca.name}
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Remitos</h1>
          <p className="text-muted-foreground text-sm">
            {datos.cantidad === 0
              ? 'Sin remitos cargados'
              : `${datos.cantidad} remito(s) · ${formatearMonto(datos.total)} en total`}
          </p>
        </div>

        {puedeCargar ? (
          <Button asChild size="sm">
            <Link href={`/fincas/${farmId}/remitos/nuevo`}>
              <Plus className="size-4" />
              Cargar
            </Link>
          </Button>
        ) : null}
      </div>

      {datos.remitos.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-medium">Todavía no hay remitos</p>
          {puedeCargar ? (
            <Button asChild className="mt-4">
              <Link href={`/fincas/${farmId}/remitos/nuevo`}>Cargar el primero</Link>
            </Button>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-3">
          {datos.remitos.map((remito) => (
            <li key={remito.id}>
              <Card>
                <CardContent className="space-y-3">
                  {/* Solo el encabezado navega al detalle: si el enlace
                      envolviera la tarjeta entera, tocar una miniatura
                      abandonaría la página en vez de ampliar la foto. */}
                  <Link
                    href={`/fincas/${farmId}/remitos/${remito.id}`}
                    className="hover:bg-accent/50 -m-2 flex items-center gap-3 rounded-md p-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums">
                        {formatearMonto(remito.amount, remito.currency)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {formatoFecha.format(new Date(remito.issueDate))}
                        {remito.number ? ` · N° ${remito.number}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </Link>

                  {remito.description ? (
                    <p className="text-sm whitespace-pre-wrap">{remito.description}</p>
                  ) : null}

                  <GaleriaRemito fotos={remito.photos} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
