/**
 * Normaliza un texto libre a un slug estable.
 *
 * Es la clave de unicidad de los catálogos extensibles (ServiceType.slug,
 * Pump.normalizedLabel). El seed y el alta al vuelo desde el combobox usan
 * ESTA misma función: si divergieran, entrarían duplicados que el índice único
 * no puede atrapar.
 */
export function toSlug(value: string): string {
  return value
    .normalize('NFD') // separa la letra base de su diacrítico
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // todo lo que no sea alfanumérico separa
    .replace(/^-+|-+$/g, '')
}
