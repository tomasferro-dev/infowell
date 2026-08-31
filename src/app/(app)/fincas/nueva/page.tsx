import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { FincaForm } from '@/components/forms/finca-form'
import { Button } from '@/components/ui/button'
import { CAMPOS_ARRASTRADOS, textoDeUrl, ubicacionDeUrl } from '@/lib/colocacion-mapa'
import { crearFincaAction } from '@/server/actions/farms'
import { requireAccess } from '@/server/guards'

export default async function NuevaFincaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Solo el admin crea fincas. Sin esto, la página se renderizaría para
  // cualquiera y el bloqueo quedaría únicamente en la action.
  await requireAccess('write', 'user')

  const query = await searchParams
  const { latitude, longitude, desdeMapa } = ubicacionDeUrl(query)

  // Lo que el usuario había escrito antes de irse al mapa a marcar el punto.
  const borrador = Object.fromEntries(
    CAMPOS_ARRASTRADOS.finca.map((campo) => [campo, textoDeUrl(query[campo])]),
  ) as Record<(typeof CAMPOS_ARRASTRADOS.finca)[number], string | null>

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/fincas">
          <ChevronLeft className="size-4" />
          Fincas
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Nueva finca</h1>

      <FincaForm
        action={crearFincaAction}
        textoBoton="Crear finca"
        finca={{
          name: borrador.name ?? '',
          taxId: borrador.taxId,
          address: borrador.address,
          city: borrador.city,
          province: borrador.province,
          contactName: borrador.contactName,
          contactPhone: borrador.contactPhone,
          contactEmail: borrador.contactEmail,
          notes: borrador.notes,
          latitude,
          longitude,
        }}
        origenUbicacion={desdeMapa ? 'mapa' : undefined}
      />
    </div>
  )
}
