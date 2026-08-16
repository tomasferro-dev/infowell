import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoLista, EsqueletoPanel } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-6">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <EsqueletoPanel />
      <EsqueletoLista filas={3} />
    </div>
  )
}
