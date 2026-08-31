import { CatalogoTabs } from '@/components/layout/catalogo-tabs'
import { AvisoDeCarga } from '@/components/layout/esqueletos'
import { Skeleton } from '@/components/ui/skeleton'

export default function CargandoConfiguracion() {
  return (
    <div className="space-y-5">
      <CatalogoTabs />
      <div aria-hidden="true" className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44 w-full" />
      </div>
      <AvisoDeCarga />
    </div>
  )
}
