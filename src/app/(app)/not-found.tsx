import { SearchX } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * Pantalla de "no encontrado".
 *
 * Se ve más seguido de lo que parece: la app responde 404 —y no 403— cuando
 * alguien pide algo que no le corresponde, para no confirmar que exista. Por
 * eso el texto no acusa ni menciona permisos: dice lo mismo para un enlace
 * viejo que para una finca ajena.
 */
export default function NoEncontrado() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <SearchX className="size-7" />
      </div>

      <div>
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Puede que el enlace esté viejo o que el dato ya no exista.
        </p>
      </div>

      <Button asChild className="h-12 text-base">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  )
}
