import { requireAccess } from '@/server/guards'

/**
 * Puerta de acceso a la administración.
 *
 * Igual que el layout de finca: el chequeo va acá para que el 404 salga con
 * el código correcto. Las páginas tienen `loading.tsx` y, una vez que empieza
 * el streaming, el estado HTTP ya no se puede cambiar.
 *
 * 'write' sobre 'user' es el permiso que solo tiene el ADMIN.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAccess('write', 'user')

  return children
}
