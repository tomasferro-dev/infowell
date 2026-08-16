import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoGrillaFotos, EsqueletoTarjeta } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-6">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <EsqueletoTarjeta alto="h-28" />
      <EsqueletoGrillaFotos />
    </div>
  )
}
