import { CatalogoAdmin } from '@/components/forms/catalogo-admin'
import { CatalogoTabs } from '@/components/layout/catalogo-tabs'
import { alternarServicioAction, crearServicioAction } from '@/server/actions/catalog'
import { listarServiciosTodos } from '@/server/queries/catalog'

export default async function ServiciosPage() {
  // La query exige permiso de escritura sobre el catálogo: si no es admin,
  // corta con 404 antes de renderizar nada.
  const servicios = await listarServiciosTodos()

  return (
    <div className="space-y-5">
      <CatalogoTabs />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
        <p className="text-muted-foreground text-sm">
          Los que aparecen como cards al cargar una intervención. Los de base no se pueden
          borrar, solo desactivar.
        </p>
      </div>

      <CatalogoAdmin
        items={servicios.map((s) => ({
          id: s.id,
          label: s.name,
          isSystem: s.isSystem,
          isActive: s.isActive,
          usos: s._count.interventions,
        }))}
        onCrear={crearServicioAction}
        onAlternar={alternarServicioAction}
        etiquetaSingular="servicio"
        placeholder="Ej: Ensayo de bombeo"
      />
    </div>
  )
}
