/**
 * Perfil del pozo: corte vertical a escala.
 *
 * Es el dibujo que hace un perforista en una hoja cuando explica un pozo, y
 * acá cumple la misma función. Las seis mediciones que guardamos son números
 * abstractos —"nivel dinámico 30 m" no le dice nada al dueño de la finca—;
 * puestas en un corte, se leen de un vistazo: cuánta agua hay sobre la bomba,
 * cuánto baja al bombear, cuánto pozo queda por debajo.
 *
 * Se dibuja del lado del servidor, sin JavaScript: es un SVG y nada más.
 */

export type MedicionesPerfil = {
  depthM: number | null
  pumpDepthM: number | null
  staticLevelM: number | null
  dynamicLevelM: number | null
  boreDiameterIn: number | null
}

const ANCHO = 320
const ALTO = 380
const CIELO = 46 // franja de superficie, arriba del terreno
const PISO = 26 // margen inferior

/** Ancho del entubado en pantalla. No va a escala: es un esquema, no un plano. */
const ANCHO_POZO = 58

export function PerfilPozo({ mediciones }: { mediciones: MedicionesPerfil }) {
  const { depthM, pumpDepthM, staticLevelM, dynamicLevelM, boreDiameterIn } = mediciones

  // La escala se ancla a la medida más profunda que exista. Sin ninguna
  // profundidad no hay nada que dibujar a escala, y un esquema inventado
  // sería peor que no mostrar nada.
  const fondo = Math.max(depthM ?? 0, pumpDepthM ?? 0, dynamicLevelM ?? 0, staticLevelM ?? 0)
  if (fondo <= 0) return null

  const alturaUtil = ALTO - CIELO - PISO
  /** Metros → coordenada Y. La escala es lineal desde la boca del pozo. */
  const y = (metros: number) => CIELO + (metros / fondo) * alturaUtil

  const centroX = 96
  const izq = centroX - ANCHO_POZO / 2
  const der = centroX + ANCHO_POZO / 2

  const yFondo = y(depthM ?? fondo)
  const yEstatico = staticLevelM == null ? null : y(staticLevelM)
  const yDinamico = dynamicLevelM == null ? null : y(dynamicLevelM)
  const yBomba = pumpDepthM == null ? null : y(pumpDepthM)

  /**
   * El agua se dibuja desde el nivel ESTÁTICO hacia abajo, porque ese es el
   * pozo en reposo: el dinámico solo existe mientras la bomba trabaja.
   *
   * La franja entre estático y dinámico se pinta más suave: es el agua que se
   * consume al bombear (el abatimiento), no la que está siempre.
   */
  const yAguaEnReposo = yEstatico ?? yDinamico
  const yAguaPermanente = yDinamico ?? yEstatico

  const abatimiento =
    staticLevelM != null && dynamicLevelM != null ? dynamicLevelM - staticLevelM : null

  return (
    <figure className="space-y-3">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={describir(mediciones, abatimiento)}
      >
        {/* Terreno */}
        <rect x="0" y={CIELO} width={ANCHO} height={ALTO - CIELO} className="fill-muted" />
        <line
          x1="0"
          x2={ANCHO}
          y1={CIELO}
          y2={CIELO}
          className="stroke-foreground"
          strokeWidth={2}
        />
        <text x="4" y={CIELO - 10} className="fill-muted-foreground text-[11px]">
          Nivel del terreno
        </text>

        {/* Entubado */}
        <rect
          x={izq}
          y={CIELO}
          width={ANCHO_POZO}
          height={yFondo - CIELO}
          className="fill-background stroke-foreground"
          strokeWidth={2}
        />

        {/* Agua en reposo: desde el nivel estático hasta el fondo. */}
        {yAguaEnReposo != null ? (
          <rect
            x={izq + 2}
            y={yAguaEnReposo}
            width={ANCHO_POZO - 4}
            height={Math.max(yFondo - yAguaEnReposo - 1, 0)}
            className="fill-chart-1"
            opacity={0.18}
          />
        ) : null}

        {/* Agua que queda incluso bombeando: del nivel dinámico hacia abajo.
            El tono más fuerte separa lo permanente de lo que se consume. */}
        {yAguaPermanente != null ? (
          <rect
            x={izq + 2}
            y={yAguaPermanente}
            width={ANCHO_POZO - 4}
            height={Math.max(yFondo - yAguaPermanente - 1, 0)}
            className="fill-chart-1"
            opacity={0.32}
          />
        ) : null}

        {/* Nivel estático: la línea llena. Es el pozo en reposo. */}
        {yEstatico != null ? (
          <Nivel
            y={yEstatico}
            izq={izq}
            der={der}
            etiqueta={`Estático · ${staticLevelM} m`}
            clase="stroke-chart-1"
          />
        ) : null}

        {/* Nivel dinámico: punteada, porque solo existe con la bomba en marcha. */}
        {yDinamico != null ? (
          <Nivel
            y={yDinamico}
            izq={izq}
            der={der}
            etiqueta={`Dinámico · ${dynamicLevelM} m`}
            clase="stroke-chart-2"
            punteada
          />
        ) : null}

        {/* Abatimiento: lo que baja el agua al bombear. Es EL dato de salud de
            un pozo, y en el corte se ve como distancia, no como resta. */}
        {yEstatico != null && yDinamico != null && yDinamico - yEstatico > 10 ? (
          <g>
            <line
              x1={der + 26}
              x2={der + 26}
              y1={yEstatico}
              y2={yDinamico}
              className="stroke-muted-foreground"
              strokeWidth={1}
            />
            <text
              x={der + 32}
              y={(yEstatico + yDinamico) / 2}
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              abate {abatimiento?.toFixed(1)} m
            </text>
          </g>
        ) : null}

        {/* Electrobomba */}
        {yBomba != null ? (
          <g>
            <rect
              x={centroX - 11}
              y={yBomba - 16}
              width={22}
              height={32}
              rx={3}
              className="fill-foreground"
            />
            <line
              x1={centroX}
              x2={centroX}
              y1={CIELO}
              y2={yBomba - 16}
              className="stroke-foreground"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
            <text x={der + 8} y={yBomba + 4} className="fill-foreground text-[11px] font-medium">
              Bomba · {pumpDepthM} m
            </text>
          </g>
        ) : null}

        {/* Fondo del pozo, con la regla de marca */}
        {depthM != null ? (
          <g>
            <rect x={izq - 6} y={yFondo} width={ANCHO_POZO + 12} height={3} className="fill-brand" />
            <text
              x={der + 8}
              y={yFondo + 14}
              className="fill-foreground text-[11px] font-semibold"
            >
              Fondo · {depthM} m
            </text>
          </g>
        ) : null}

        {/* El diámetro va afuera del entubado, a la izquierda: adentro se
            superponía con la pared del pozo. */}
        {boreDiameterIn != null ? (
          <text
            x={izq - 8}
            y={CIELO + 16}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            ⌀ {boreDiameterIn}″
          </text>
        ) : null}
      </svg>

      <figcaption className="text-muted-foreground text-xs">
        Corte a escala según la última medición. El eje va hacia abajo: más metros, más profundo.
      </figcaption>
    </figure>
  )
}

function Nivel({
  y,
  izq,
  der,
  etiqueta,
  clase,
  punteada,
}: {
  y: number
  izq: number
  der: number
  etiqueta: string
  clase: string
  punteada?: boolean
}) {
  return (
    <g>
      <line
        x1={izq - 10}
        x2={der + 4}
        y1={y}
        y2={y}
        className={clase}
        strokeWidth={2.5}
        strokeDasharray={punteada ? '5 4' : undefined}
      />
      <text x={der + 8} y={y + 4} className="fill-foreground text-[11px]">
        {etiqueta}
      </text>
    </g>
  )
}

/** Texto alternativo: quien no ve el dibujo tiene que recibir lo mismo. */
function describir(m: MedicionesPerfil, abatimiento: number | null): string {
  const partes: string[] = ['Corte del pozo.']

  if (m.depthM != null) partes.push(`Profundidad total ${m.depthM} metros.`)
  if (m.staticLevelM != null) partes.push(`Nivel estático a ${m.staticLevelM} metros.`)
  if (m.dynamicLevelM != null) partes.push(`Nivel dinámico a ${m.dynamicLevelM} metros.`)
  if (abatimiento != null) partes.push(`Abatimiento de ${abatimiento.toFixed(1)} metros.`)
  if (m.pumpDepthM != null) partes.push(`Bomba instalada a ${m.pumpDepthM} metros.`)

  return partes.join(' ')
}
