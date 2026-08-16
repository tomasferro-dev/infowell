import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoLista } from '@/components/layout/esqueletos'
import { Skeleton } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="space-y-5">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      {/* El buscador ocupa lugar desde el principio: si apareciera despues,
          la lista saltaria hacia abajo justo cuando se esta por tocar. */}
      <Skeleton className="h-12 w-full rounded-md" />
      <EsqueletoLista filas={5} />
    </div>
  )
}
