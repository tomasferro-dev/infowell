import { Calendar, ChevronLeft, FileText, Hash, User } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { GaleriaRemito } from '@/components/data/galeria-remito'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatearMonto } from '@/lib/validation/remito'
import { obtenerRemito } from '@/server/queries/receipts'

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' })

export default async function RemitoPage({
  params,
}: {
  params: Promise<{ farmId: string; receiptId: string }>
}) {
  const { farmId, receiptId } = await params

  const remito = await obtenerRemito(farmId, receiptId)
  if (!remito) notFound()

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/fincas/${farmId}/remitos`}>
          <ChevronLeft className="size-4" />
          Remitos
        </Link>
      </Button>

      {/* El monto es el dato que se viene a buscar: va primero y grande. */}
      <div>
        <p className="text-3xl font-bold tabular-nums">
          {formatearMonto(remito.amount, remito.currency)}
        </p>
        <p className="text-muted-foreground text-sm">{remito.farm.name}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 text-sm">
          <Dato icono={<Calendar className="size-4" />} etiqueta="Fecha">
            {formatoFecha.format(new Date(remito.issueDate))}
          </Dato>

          {remito.number ? (
            <Dato icono={<Hash className="size-4" />} etiqueta="N° de remito">
              {remito.number}
            </Dato>
          ) : null}

          <Dato icono={<User className="size-4" />} etiqueta="Cargado por">
            {remito.autor}
          </Dato>
        </CardContent>
      </Card>

      {remito.description ? (
        <Card>
          <CardContent className="text-sm whitespace-pre-wrap">{remito.description}</CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {remito.photos.length === 0
            ? 'Fotos'
            : `${remito.photos.length} ${remito.photos.length === 1 ? 'foto' : 'fotos'}`}
        </h2>

        {remito.photos.length === 0 ? (
          <Card className="p-6 text-center">
            <FileText className="text-muted-foreground mx-auto size-7" />
            <p className="text-muted-foreground mt-2 text-sm">
              Este remito se cargó sin fotos.
            </p>
          </Card>
        ) : (
          // Grilla de 2 columnas: acá las fotos son el contenido, no un
          // acompañamiento, así que se ven más grandes que en el listado.
          <GaleriaRemito fotos={remito.photos} columnas={2} />
        )}
      </section>
    </div>
  )
}

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono: React.ReactNode
  etiqueta: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icono}</span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{etiqueta}</p>
        <p>{children}</p>
      </div>
    </div>
  )
}
