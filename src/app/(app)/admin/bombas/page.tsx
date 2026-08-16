import { CatalogoAdmin } from '@/components/forms/catalogo-admin'
import { CatalogoTabs } from '@/components/layout/catalogo-tabs'
import { alternarBombaAction, crearBombaAction } from '@/server/actions/catalog'
import { listarBombasTodas } from '@/server/queries/catalog'

export default async function BombasPage() {
  const bombas = await listarBombasTodas()

  return (
    <div className="space-y-5">
      <CatalogoTabs />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Electrobombas</h1>
        <p className="text-muted-foreground text-sm">
          Modelos disponibles al registrar el estado técnico de un pozo. También se pueden crear
          en el momento, desde el propio formulario.
        </p>
      </div>

      {bombas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay electrobombas cargadas. Agregá la primera abajo, o creala al vuelo
          cuando registres una intervención.
        </p>
      ) : null}

      <CatalogoAdmin
        items={bombas.map((b) => ({
          id: b.id,
          label: b.label,
          isSystem: b.isSystem,
          isActive: b.isActive,
          usos: b._count.readings,
        }))}
        onCrear={crearBombaAction}
        onAlternar={alternarBombaAction}
        etiquetaSingular="electrobomba"
        placeholder="Ej: Grundfos SP 5A-12"
      />
    </div>
  )
}
