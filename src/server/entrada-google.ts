/**
 * Quién puede entrar con Google.
 *
 * Es una LISTA BLANCA, y esa es toda la idea: el email tiene que estar ya dado
 * de alta en la app. Sin esto, cargar las credenciales de OAuth abriría
 * InfoWell a cualquiera con una cuenta de Google —o sea, a cualquiera— y acá
 * hay datos de fincas de clientes distintos.
 *
 * Google no crea cuentas: solo es otra forma de entrar para quien ya la tiene.
 * El alta la sigue haciendo el administrador, que es quien sabe qué finca le
 * corresponde a cada uno.
 *
 * Pura y sin Prisma para poder probarla: la decisión es la parte delicada, la
 * consulta es trámite.
 */
export function puedeEntrarPorGoogle(
  /**
   * Las cuentas cuyo email coincide, sin distinguir mayúsculas.
   *
   * Es una lista y no una fila porque la búsqueda tiene que ser insensible a
   * mayúsculas —los emails se guardan tal como los escribe el administrador, y
   * Google los manda en minúscula—, y eso puede devolver más de una.
   */
  coincidencias: { email: string | null; isActive: boolean }[],
): boolean {
  /*
   * Exactamente una.
   *
   * Ninguna: no está dado de alta. Más de una: hay dos cuentas que solo
   * difieren en mayúsculas y no se puede saber a cuál de las dos personas
   * corresponde. Una puerta de entrada que adivina no es una puerta.
   */
  if (coincidencias.length !== 1) return false

  const usuario = coincidencias[0]!

  // Sin email no hay contra qué comparar; y un usuario dado de baja no entra
  // por ninguna puerta: si entrara por Google, desactivarlo no serviría de
  // nada porque bastaría con cambiar de botón.
  return Boolean(usuario.email) && usuario.isActive
}
