import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueletos de carga.
 *
 * Todos son DECORATIVOS (aria-hidden): sus formas no son contenido. Quien usa
 * un lector de pantalla recibe el aviso de `AvisoDeCarga` una sola vez, en vez
 * de una lista de elementos vacíos. Eso además evita que un test —o cualquier
 * consulta por rol— cuente las filas del esqueleto como si fueran datos.
 *
 * La regla que siguen: cada uno imita la FORMA de la pantalla que reemplaza.
 * Un spinner genérico centrado avisa que algo pasa, pero el contenido después
 * aparece de golpe y en otro lugar. Un esqueleto con la silueta correcta hace
 * que la pantalla se sienta ya cargada y que el contenido solo se complete.
 */

export function EsqueletoEncabezado() {
  return (
    <div aria-hidden className="space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  )
}

/** Filas de una lista: fincas, pozos, remitos, usuarios. */
export function EsqueletoLista({ filas = 4 }: { filas?: number }) {
  return (
    <ul aria-hidden className="space-y-2">
      {Array.from({ length: filas }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border p-4">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="size-4 shrink-0" />
        </li>
      ))}
    </ul>
  )
}

/**
 * El panel del inicio: tres conteos arriba y el monto a lo ancho abajo.
 *
 * Sigue la forma real del panel. Un esqueleto con otra silueta hace saltar el
 * contenido cuando llega, que es justo lo que el esqueleto viene a evitar.
 */
export function EsqueletoPanel() {
  return (
    <div aria-hidden className="divide-y overflow-hidden rounded-md border">
      <div className="grid grid-cols-3 divide-x">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 px-3 py-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-32" />
      </div>
    </div>
  )
}

export function EsqueletoTarjeta({ alto = 'h-28' }: { alto?: string }) {
  return <Skeleton aria-hidden className={`w-full rounded-lg ${alto}`} />
}

/** Grilla de fotos, para el detalle del remito. */
export function EsqueletoGrillaFotos({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-2">
      {Array.from({ length: cantidad }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-md" />
      ))}
    </div>
  )
}

/** Formularios: pares de etiqueta y campo. */
export function EsqueletoFormulario({ campos = 5 }: { campos?: number }) {
  return (
    <div aria-hidden className="space-y-5">
      {Array.from({ length: campos }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  )
}

/**
 * Aviso audible de que la pantalla está cargando.
 *
 * Los esqueletos son decorativos, así que sin esto un lector de pantalla no
 * anunciaría nada mientras se espera. Va en cada `loading.tsx`.
 */
export function AvisoDeCarga() {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      Cargando…
    </p>
  )
}
