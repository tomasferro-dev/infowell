/**
 * Cómo se rotula cada punto del mapa.
 *
 * Sin rótulo, diez pines idénticos sobre una imagen satelital no dicen nada:
 * hay que tocarlos de a uno para saber cuál es cuál. Con dos letras y un
 * número, el mapa se lee de un vistazo.
 */

/** Palabras que no aportan a la identidad de una finca. */
const VACIAS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'san',
  'santa',
  'sa',
  'srl',
])

/**
 * Dos letras que representen el nombre de una finca.
 *
 * Con dos o más palabras útiles toma la inicial de cada una («Bodega Alto
 * Cerro» → BA). Con una sola, sus dos primeras letras («Peñaflor» → PE).
 */
export function inicialesDeFinca(nombre: string): string {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s.\-_/]+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ''))
    .filter((p) => p.length > 0)

  const utiles = palabras.filter((p) => !VACIAS.has(p.toLowerCase()))
  // Si TODAS eran palabras vacías, mejor usarlas que devolver nada.
  const base = utiles.length > 0 ? utiles : palabras

  if (base.length === 0) return '??'
  if (base.length === 1) return base[0]!.slice(0, 2).toUpperCase()

  return (base[0]![0]! + base[1]![0]!).toUpperCase()
}

/**
 * Numera los pozos de una finca, del 1 al n.
 *
 * Se numeran TODOS los pozos de la finca, tengan ubicación o no. Si se
 * numeraran solo los que salen en el mapa, el «Pozo 2» del mapa podría ser el
 * tercero de la finca, y el número dejaría de coincidir con lo que el técnico
 * ve en la ficha del pozo.
 *
 * Con el criterio por fecha de perforación, los que no la tienen cargada van
 * al final: son los que menos se sabe de ellos, y así no corren la numeración
 * de los que sí tienen dato.
 */
export function numerarPozos<T extends { id: string; createdAt: Date; drilledAt: Date | null }>(
  pozos: T[],
  criterio: 'carga' | 'perforacion',
): Map<string, number> {
  const ordenados = [...pozos].sort((a, b) => {
    if (criterio === 'perforacion') {
      if (a.drilledAt && b.drilledAt) {
        const dif = a.drilledAt.getTime() - b.drilledAt.getTime()
        if (dif !== 0) return dif
      } else if (a.drilledAt !== b.drilledAt) {
        return a.drilledAt ? -1 : 1
      }
    }

    // Desempate —y criterio por defecto— por orden de carga. El id entra al
    // final para que el orden sea estable: dos pozos cargados en el mismo
    // milisegundo no pueden intercambiarse entre recargas de la página.
    const dif = a.createdAt.getTime() - b.createdAt.getTime()
    return dif !== 0 ? dif : a.id.localeCompare(b.id)
  })

  return new Map(ordenados.map((pozo, i) => [pozo.id, i + 1]))
}
