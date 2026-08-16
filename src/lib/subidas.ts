/**
 * Traduce un fallo de /api/uploads/sign a un mensaje que le sirva a quien lo
 * está viendo en el celular.
 *
 * Sin esto, todos los fallos se ven iguales: un problema de configuración del
 * servidor, una sesión vencida y un archivo rechazado producían el mismo
 * "no se pudo subir", y no había forma de saber a quién reclamarle.
 */
export async function describirFalloDeFirma(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as
    | { error?: string; detalle?: string }
    | null

  if (respuesta.status === 401) {
    return 'Se cerró tu sesión. Volvé a entrar y probá de nuevo.'
  }

  if (respuesta.status === 404) {
    return 'No tenés permiso para subir archivos a esta finca.'
  }

  if (respuesta.status === 400) {
    return cuerpo?.detalle ?? 'El archivo no es de un tipo permitido.'
  }

  // 502: el servidor no pudo hablar con Storage. Es configuración, no del
  // usuario — el mensaje se lo dice para que no siga intentando.
  return (
    cuerpo?.detalle ??
    `No se pudo preparar la subida (error ${respuesta.status}). Avisale al administrador.`
  )
}
