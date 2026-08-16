import { AvisoDeCarga, EsqueletoEncabezado, EsqueletoTarjeta } from '@/components/layout/esqueletos'

export default function Cargando() {
  return (
    <div className="space-y-5">
      <AvisoDeCarga />
      <EsqueletoEncabezado />
      <div className="space-y-3">
        <EsqueletoTarjeta alto="h-40" />
        <EsqueletoTarjeta alto="h-40" />
        <EsqueletoTarjeta alto="h-40" />
      </div>
    </div>
  )
}
