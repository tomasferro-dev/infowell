import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { UsuarioForm } from '@/components/forms/usuario-form'
import { Button } from '@/components/ui/button'
import { crearUsuarioAction } from '@/server/actions/users'
import { fincasParaAsignar } from '@/server/queries/users'

export default async function NuevoUsuarioPage() {
  const fincas = await fincasParaAsignar()

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/usuarios">
          <ChevronLeft className="size-4" />
          Usuarios
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Nuevo usuario</h1>

      <UsuarioForm action={crearUsuarioAction} fincas={fincas} textoBoton="Crear usuario" />
    </div>
  )
}
