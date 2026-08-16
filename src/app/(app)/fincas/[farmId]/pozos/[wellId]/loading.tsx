import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoTarjeta } from '@/components/layout/esqueletos'
import { Skeleton } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="space-y-6">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <Skeleton className="h-12 w-full rounded-md" />
      {/* Las tres pestanas, para que la fila no cambie de alto al llegar. */}
      <Skeleton className="h-10 w-full rounded-md" />
      <EsqueletoTarjeta alto="h-40" />
      <EsqueletoTarjeta alto="h-32" />
    </div>
  )
}
