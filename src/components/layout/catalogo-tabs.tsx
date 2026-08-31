'use client'

import { Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Navegación de la zona de administración. Cliente, porque marca el activo.
 *
 * Los dos catálogos van adentro del recuadro y la configuración queda afuera,
 * como ícono. Con las tres palabras adentro, «Configuración» no entraba en una
 * pantalla de teléfono: se salía del recuadro y dejaba TODO el sitio
 * deslizable hacia la derecha, con contenido escondido fuera de la vista.
 *
 * Además no son lo mismo: los catálogos son dos vistas hermanas entre las que
 * se alterna; la configuración es otra cosa. Sacarla del recuadro lo dice.
 */

const CATALOGOS = [
  { href: '/admin/servicios', label: 'Servicios' },
  { href: '/admin/bombas', label: 'Electrobombas' },
] as const

const CONFIGURACION = '/admin/configuracion'

export function CatalogoTabs() {
  const pathname = usePathname()
  const enConfiguracion = pathname === CONFIGURACION

  return (
    <div className="flex items-center gap-2">
      <nav className="bg-muted flex min-w-0 flex-1 gap-1 rounded-lg p-1">
        {CATALOGOS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? 'page' : undefined}
            className={cn(
              'flex-1 truncate rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
              pathname === tab.href
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Solo el ícono, pero con nombre accesible: sin él, un lector de
          pantalla anuncia «enlace» y no dice adónde lleva. */}
      <Link
        href={CONFIGURACION}
        aria-label="Configuración"
        aria-current={enConfiguracion ? 'page' : undefined}
        title="Configuración"
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-lg border transition-colors',
          'focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none',
          enConfiguracion
            ? 'bg-accent text-foreground border-foreground/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        )}
      >
        <Settings className="size-5" />
      </Link>
    </div>
  )
}
