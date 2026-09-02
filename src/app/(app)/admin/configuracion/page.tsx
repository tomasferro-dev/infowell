import { CatalogoTabs } from '@/components/layout/catalogo-tabs'
import { NumeracionPozos } from '@/components/forms/numeracion-pozos'
import { RespaldoDatos } from '@/components/forms/respaldo-datos'
import { guardarNumeracionAction } from '@/server/actions/ajustes'
import { exportarAction, importarAction } from '@/server/actions/respaldo'
import { requireAccess } from '@/server/guards'
import { criterioDeNumeracion } from '@/server/queries/ajustes'

export const metadata = { title: 'Configuración' }

export default async function ConfiguracionPage() {
  // Corta con 404 si no es admin, antes de renderizar nada.
  await requireAccess('write', 'setting')

  const criterio = await criterioDeNumeracion()

  return (
    <div className="space-y-5">
      <CatalogoTabs />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Ajustes que valen para toda la empresa. Los cambios los ven todos los usuarios.
        </p>
      </div>

      <NumeracionPozos criterio={criterio} onGuardar={guardarNumeracionAction} />

      <hr />

      <RespaldoDatos onExportar={exportarAction} onImportar={importarAction} />
    </div>
  )
}
