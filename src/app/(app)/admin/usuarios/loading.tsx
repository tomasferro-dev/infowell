import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoLista } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-5">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <EsqueletoLista filas={5} />
    </div>
  )
}
