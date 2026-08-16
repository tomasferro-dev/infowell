import { Plus, UserCog } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FlechaOCarga } from '@/components/layout/indicador-enlace'
import { listarUsuarios } from '@/server/queries/users'

const ETIQUETA_ROL = {
  ADMIN: 'Administrador',
  CARGADOR: 'Cargador',
  CLIENTE: 'Cliente',
} as const

export default async function UsuariosPage() {
  // La query ya exige el permiso: si no es admin, corta acá con 404.
  const usuarios = await listarUsuarios()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <Button asChild size="sm">
          <Link href="/admin/usuarios/nuevo">
            <Plus className="size-4" />
            Nuevo
          </Link>
        </Button>
      </div>

      <ul className="space-y-2">
        {usuarios.map((usuario) => (
          <li key={usuario.id}>
            <Link
              href={`/admin/usuarios/${usuario.id}`}
              className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <UserCog className="text-muted-foreground size-5 shrink-0" />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{usuario.name ?? usuario.email}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {ETIQUETA_ROL[usuario.role]}
                  {usuario.role !== 'ADMIN'
                    ? ` · ${usuario._count.memberships} finca(s)`
                    : ' · todas las fincas'}
                </p>
              </div>

              {!usuario.isActive ? (
                <Badge variant="outline" className="shrink-0">
                  Inactivo
                </Badge>
              ) : null}
              <FlechaOCarga />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
