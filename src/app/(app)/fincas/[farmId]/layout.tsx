import { requireAccess } from '@/server/guards'

/**
 * Puerta de acceso a TODO lo que cuelga de una finca.
 *
 * Está en un layout y no solo en cada página por una razón concreta: las
 * páginas tienen `loading.tsx`, que hace que Next empiece a transmitir la
 * respuesta antes de terminar de renderizarlas. Una vez que la cabecera salió
 * ya no se puede cambiar el código HTTP, así que un `notFound()` desde la
 * página mostraba la pantalla correcta pero con estado 200.
 *
 * El layout se resuelve ANTES de que arranque el streaming, así que acá el
 * 404 sí sale como 404 — que es lo que hace que pedir una finca ajena sea
 * indistinguible de pedir una que no existe.
 *
 * Los guards de cada página y de cada query se conservan igual: esto es una
 * barrera más, no un reemplazo.
 */
export default async function FincaLayout({
  children,
  params,
}: LayoutProps<'/fincas/[farmId]'>) {
  const { farmId } = await params

  await requireAccess('read', 'farm', farmId)

  return children
}
