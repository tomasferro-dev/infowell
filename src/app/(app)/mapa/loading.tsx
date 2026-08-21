import { Skeleton } from '@/components/ui/skeleton'

export default function CargandoMapa() {
  return (
    <div className="fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10">
      <Skeleton className="h-full w-full rounded-none" aria-hidden="true" />
      <p role="status" className="sr-only">
        Cargando el mapa
      </p>
    </div>
  )
}
