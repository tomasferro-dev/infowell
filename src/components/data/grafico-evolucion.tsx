import { cn } from '@/lib/utils'

/**
 * Gráfico de evolución, SVG renderizado en el servidor (sin JS ni librerías).
 *
 * Dos decisiones que definen cómo se lee:
 *
 * 1. NIVELES Y CAUDAL VAN EN GRÁFICOS SEPARADOS. Son unidades distintas (m y
 *    m³/h); meterlos en un mismo par de ejes obligaría a dos escalas verticales,
 *    que es la forma más fácil de sugerir correlaciones que no existen.
 *
 * 2. EN LOS NIVELES, EL EJE Y VA INVERTIDO. Se miden como profundidad desde la
 *    boca del pozo: 30 m está más abajo que 18 m. Dibujarlos "hacia arriba"
 *    mostraría un pozo que se recupera cuando en realidad se está hundiendo.
 */

export type PuntoSerie = { fecha: string; valor: number }

export type Serie = {
  nombre: string
  color: string
  puntos: PuntoSerie[]
}

const ANCHO = 640
const ALTO = 220
const PAD = { arriba: 16, derecha: 16, abajo: 28, izquierda: 44 }

const formatoFechaCorta = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })
const formatoFechaLarga = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

export function GraficoEvolucion({
  series,
  unidad,
  invertirY = false,
  className,
}: {
  series: Serie[]
  unidad: string
  /** true para profundidades: más metros = más abajo en pantalla. */
  invertirY?: boolean
  className?: string
}) {
  const conDatos = series.filter((s) => s.puntos.length > 0)
  const todos = conDatos.flatMap((s) => s.puntos)

  // Una línea necesita dos puntos. Con uno solo se informa el valor y listo:
  // dibujar un punto suelto con ejes aparenta una tendencia que no existe.
  if (todos.length < 2) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Hacen falta al menos dos mediciones para ver la evolución.
      </p>
    )
  }

  const tiempos = todos.map((p) => new Date(p.fecha).getTime())
  const tMin = Math.min(...tiempos)
  const tMax = Math.max(...tiempos)
  const rangoT = tMax - tMin || 1

  const valores = todos.map((p) => p.valor)
  let vMin = Math.min(...valores)
  let vMax = Math.max(...valores)

  // Un respiro arriba y abajo para que las líneas no toquen los bordes.
  const margen = (vMax - vMin || Math.abs(vMax) || 1) * 0.15
  vMin -= margen
  vMax += margen

  const x = (fecha: string) =>
    PAD.izquierda +
    ((new Date(fecha).getTime() - tMin) / rangoT) * (ANCHO - PAD.izquierda - PAD.derecha)

  const y = (valor: number) => {
    const proporcion = (valor - vMin) / (vMax - vMin || 1)
    const alto = ALTO - PAD.arriba - PAD.abajo
    // Sin invertir, el 0 del SVG está arriba: se da vuelta para que más valor
    // quede más alto. Con invertirY se deja tal cual (más metros = más abajo).
    return invertirY ? PAD.arriba + proporcion * alto : PAD.arriba + (1 - proporcion) * alto
  }

  const marcasY = [vMin + margen, (vMin + vMax) / 2, vMax - margen]

  return (
    <figure className={cn('space-y-3', className)}>
      {/* Leyenda: la identidad nunca depende solo del color. */}
      <figcaption className="flex flex-wrap gap-4">
        {conDatos.map((serie) => (
          <span key={serie.nombre} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: serie.color }}
            />
            {serie.nombre}
          </span>
        ))}
      </figcaption>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Evolución de ${conDatos.map((s) => s.nombre).join(' y ')} en ${unidad}`}
      >
        {/* Grilla y marcas del eje Y, en tono recesivo. */}
        {marcasY.map((valor) => (
          <g key={valor}>
            <line
              x1={PAD.izquierda}
              x2={ANCHO - PAD.derecha}
              y1={y(valor)}
              y2={y(valor)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.izquierda - 8}
              y={y(valor)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {valor.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Extremos del eje X. */}
        <text
          x={PAD.izquierda}
          y={ALTO - 8}
          className="fill-muted-foreground text-[11px]"
          textAnchor="start"
        >
          {formatoFechaCorta.format(new Date(tMin))}
        </text>
        <text
          x={ANCHO - PAD.derecha}
          y={ALTO - 8}
          className="fill-muted-foreground text-[11px]"
          textAnchor="end"
        >
          {formatoFechaCorta.format(new Date(tMax))}
        </text>

        {conDatos.map((serie) => {
          const ordenados = [...serie.puntos].sort(
            (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
          )
          const d = ordenados
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.fecha)} ${y(p.valor)}`)
            .join(' ')

          return (
            <g key={serie.nombre}>
              <path
                d={d}
                fill="none"
                stroke={serie.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {ordenados.map((p) => (
                <circle
                  key={p.fecha}
                  cx={x(p.fecha)}
                  cy={y(p.valor)}
                  r={4}
                  fill={serie.color}
                  // Anillo del color de la superficie: separa los marcadores
                  // cuando las dos series se cruzan.
                  className="stroke-card"
                  strokeWidth={2}
                >
                  <title>{`${serie.nombre}: ${p.valor} ${unidad} — ${formatoFechaLarga.format(new Date(p.fecha))}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
