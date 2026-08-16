import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoLista, EsqueletoTarjeta } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-6">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <EsqueletoTarjeta alto="h-20" />
      <EsqueletoLista filas={3} />
      <EsqueletoTarjeta alto="h-16" />
    </div>
  )
}
