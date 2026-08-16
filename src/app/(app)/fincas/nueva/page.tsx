import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { FincaForm } from '@/components/forms/finca-form'
import { Button } from '@/components/ui/button'
import { crearFincaAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'

export default async function NuevaFincaPage() {
  // Solo el admin crea fincas. Sin esto, la página se renderizaría para
  // cualquiera y el bloqueo quedaría únicamente en la action.
  await requireAccess('write', 'user')

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/fincas">
          <ChevronLeft className="size-4" />
          Fincas
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Nueva finca</h1>

      <FincaForm action={crearFincaAction} textoBoton="Crear finca" />
    </div>
  )
}
