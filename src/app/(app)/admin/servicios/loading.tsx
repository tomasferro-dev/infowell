import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoLista } from '@/components/layout/esqueletos'
import { Skeleton } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="space-y-5">
      <AvisoDeCarga />
      <Skeleton className="h-11 w-full rounded-lg" />
      <EsqueletoEncabezado />
      <EsqueletoLista filas={6} />
    </div>
  )
}
