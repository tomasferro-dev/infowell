import { AvisoDeCarga, EsqueletoEncabezado } from '@/components/layout/esqueletos'
import { Skeleton } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="space-y-6">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <Skeleton className="h-12 w-full rounded-md" />
      {/* La grilla de cards de servicios, que es lo que mas tarda. */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
