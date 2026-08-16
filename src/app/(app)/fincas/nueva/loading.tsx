import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoFormulario } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-5">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <EsqueletoFormulario campos={6} />
    </div>
  )
}
