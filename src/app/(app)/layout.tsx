import { Building2, Home, LogOut, Settings, UserCog } from 'lucide-react'
import Link from 'next/link'

import { LogoArenas } from '@/components/layout/logo'
import { NavItem } from '@/components/layout/nav-item'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/server/actions/auth'
import { requireActor } from '@/server/guards'

const ETIQUETA_ROL = {
  ADMIN: 'Administrador',
  CARGADOR: 'Cargador',
  CLIENTE: 'Cliente',
} as const

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // Barrera real de sesión: el middleware solo redirige por comodidad, la
  // verificación server-side es esta.
  const actor = await requireActor()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-40 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/" aria-label="Inicio" className="shrink-0">
            <LogoArenas alto={30} />
          </Link>

          <span className="text-muted-foreground ml-auto text-[11px] font-medium tracking-wide uppercase">
            {ETIQUETA_ROL[actor.role]}
          </span>

          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>

        {/* La regla roja del logo, donde separa ARENAS de Perforaciones. Acá
            hace el mismo trabajo: cierra la identidad y abre el contenido. */}
        <div className="regla-marca" />
      </header>

      {/* pb-24 deja lugar a la barra inferior, que es fija en mobile. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">{children}</main>

      <nav className="bg-background fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-3xl">
          <NavItem href="/" icon={<Home className="size-5" />} label="Inicio" />
          <NavItem href="/fincas" icon={<Building2 className="size-5" />} label="Fincas" />
          {actor.role === 'ADMIN' ? (
            <>
              <NavItem
                href="/admin/usuarios"
                icon={<UserCog className="size-5" />}
                label="Usuarios"
              />
              <NavItem
                href="/admin/servicios"
                icon={<Settings className="size-5" />}
                label="Catálogos"
              />
            </>
          ) : null}
        </div>
      </nav>
    </div>
  )
}
