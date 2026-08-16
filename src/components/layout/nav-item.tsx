'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Ítem de la barra inferior.
 *
 * El estado activo se marca con la regla roja arriba del ícono: el mismo gesto
 * del logo, señalando en lugar de rellenar. Un fondo rojo acá competiría con
 * el contenido y, sobre todo, se confundiría con una alerta.
 */
export function NavItem({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  const pathname = usePathname()
  // '/' solo coincide exacto; el resto marca también sus subrutas.
  const activo = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
        activo ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {activo ? (
        <span aria-hidden className="regla-marca absolute inset-x-3 top-0 rounded-full" />
      ) : null}
      {icon}
      {label}
    </Link>
  )
}
