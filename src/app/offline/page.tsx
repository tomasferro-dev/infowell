import { WifiOff } from 'lucide-react'

export const metadata = {
  title: 'Sin conexión',
}

/**
 * Página que sirve el service worker cuando no hay red.
 *
 * Vive fuera del grupo (app) a propósito: ese layout exige sesión, y para
 * pedirla hace falta la base de datos — justamente lo que no hay sin conexión.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <WifiOff className="size-7" />
      </div>

      <div>
        <h1 className="text-xl font-semibold">Sin conexión</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          No hay señal en este momento. Los datos de los pozos y los remitos necesitan conexión
          para mostrarse.
        </p>
      </div>

      <p className="text-muted-foreground max-w-xs text-xs">
        Si estabas cargando un remito, revisá que se haya guardado cuando vuelva la señal.
      </p>
    </main>
  )
}
