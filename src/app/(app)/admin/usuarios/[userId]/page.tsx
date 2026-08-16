import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { UsuarioForm } from '@/components/forms/usuario-form'
import { Button } from '@/components/ui/button'
import { desactivarUsuarioAction, editarUsuarioAction, reactivarUsuarioAction } from '@/server/actions/users'
import { requireActor } from '@/server/guards'
import { fincasParaAsignar, obtenerUsuario } from '@/server/queries/users'

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  const [usuario, fincas, actor] = await Promise.all([
    obtenerUsuario(userId),
    fincasParaAsignar(),
    requireActor(),
  ])

  if (!usuario) notFound()

  const action = editarUsuarioAction.bind(null, userId)
  const esUnoMismo = actor.id === userId

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/usuarios">
          <ChevronLeft className="size-4" />
          Usuarios
        </Link>
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {usuario.name ?? usuario.email}
      </h1>

      <UsuarioForm action={action} fincas={fincas} usuario={usuario} />

      {/* Un admin no puede desactivarse a sí mismo: se dejaría afuera. */}
      {!esUnoMismo ? (
        <form
          action={usuario.isActive ? desactivarUsuarioAction.bind(null, userId) : reactivarUsuarioAction.bind(null, userId)}
          className="border-t pt-5"
        >
          <Button type="submit" variant={usuario.isActive ? 'outline' : 'default'} className="w-full">
            {usuario.isActive ? 'Desactivar usuario' : 'Reactivar usuario'}
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            {usuario.isActive
              ? 'No podrá iniciar sesión. Su historial de cargas se conserva.'
              : 'Volverá a poder iniciar sesión.'}
          </p>
        </form>
      ) : null}
    </div>
  )
}
