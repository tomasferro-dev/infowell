'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/servicios', label: 'Servicios' },
  { href: '/admin/bombas', label: 'Electrobombas' },
] as const

/** Navegación entre los dos catálogos. Cliente, porque marca el activo. */
export function CatalogoTabs() {
  const pathname = usePathname()

  return (
    <nav className="bg-muted flex gap-1 rounded-lg p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? 'page' : undefined}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
            pathname === tab.href
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
