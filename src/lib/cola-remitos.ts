/**
 * La cola de remitos que todavía no se subieron.
 *
 * El operario carga remitos en el campo, con 4G malo o sin señal. Sin cola, un
 * remito cargado sin señal se pierde y él no se entera hasta mucho después —o
 * nunca—. La regla que ordena todo este archivo es la de §10 de la bitácora:
 * **si falla en silencio, el operario cree que guardó y no guardó.**
 *
 * Por eso nada de acá dice «guardado» cuando en realidad quedó pendiente, y
 * por eso la pantalla muestra siempre cuántos faltan.
 *
 * Las fotos se guardan como Blob en IndexedDB, no como texto: una foto de
 * remito en base64 pesa un tercio más y hay que convertirla dos veces.
 */

/** Un remito esperando a que haya señal. */
export type RemitoEnCola = {
  id: string
  farmId: string
  /** Lo que el usuario escribió, tal cual va al servidor. */
  campos: Record<string, string>
  /** Las fotos sin subir todavía. */
  fotos: Blob[]
  creadoEl: number
  intentos: number
  /** Qué pasó el último intento, para poder decírselo a alguien. */
  ultimoError?: string
}

/**
 * Si un error significa «no había red» y por lo tanto conviene reintentar.
 *
 * Es la decisión que sostiene toda la cola. Encolar un rechazo del servidor
 * —un monto inválido, un permiso que no está— haría reintentar para siempre
 * algo que nunca va a andar, y el operario vería «pendiente» sin entender por
 * qué nunca sube. Al revés, no encolar un fallo de red le pierde el remito.
 *
 * `fetch` avisa que no salió tirando un TypeError, y cada navegador le pone un
 * texto distinto: Chrome «Failed to fetch», Firefox «NetworkError…», Safari
 * «Load failed». Por eso se mira el tipo y además el texto.
 */
export function esFalloDeRed(error: unknown): boolean {
  // Un pedido abortado es la señal cortándose a mitad de camino.
  if (error instanceof DOMException && error.name === 'AbortError') return true

  if (!(error instanceof TypeError)) return false

  const mensaje = error.message.toLowerCase()
  return (
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('load failed') ||
    mensaje.includes('network request failed')
  )
}

/**
 * Lo más viejo primero: es el orden en que el operario cargó las cosas, y el
 * que espera ver cuando por fin suben.
 *
 * Devuelve un arreglo nuevo. Ordenar en el lugar cambiaría el que le pasaron,
 * que en React suele ser estado y no se toca.
 */
export function ordenarCola(remitos: RemitoEnCola[]): RemitoEnCola[] {
  return [...remitos].sort((a, b) => a.creadoEl - b.creadoEl)
}

/*
 * ─────────────────────────────────────────────────────────────
 * EL ALMACÉN
 *
 * IndexedDB y no localStorage: localStorage guarda solo texto, así que una
 * foto habría que pasarla a base64 —un tercio más de peso, y dos conversiones
 * por foto— y además tiene un tope de unos pocos MB. Un remito con tres fotos
 * lo revienta.
 * ─────────────────────────────────────────────────────────────
 */

const BASE = 'infowell-cola'
const ALMACEN = 'remitos'

/**
 * Abre la base.
 *
 * Puede fallar y hay que contemplarlo: en modo incógnito, con el sitio sin
 * permiso de almacenamiento, o en un navegador viejo, `indexedDB` no está o
 * tira. Ahí la cola no existe, y quien la use tiene que enterarse para poder
 * decirle al usuario que sin señal no va a poder guardar — que es la verdad.
 */
function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') {
      rechazar(new Error('Este navegador no puede guardar remitos sin señal.'))
      return
    }

    const pedido = indexedDB.open(BASE, 1)

    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(ALMACEN)) {
        pedido.result.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
    }

    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error ?? new Error('No se pudo abrir la cola'))
  })
}

/** Envuelve una transacción para poder usarla con await. */
function transaccion<T>(
  modo: IDBTransactionMode,
  trabajo: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = db.transaction(ALMACEN, modo)
        const pedido = trabajo(tx.objectStore(ALMACEN))

        pedido.onsuccess = () => resolver(pedido.result)
        pedido.onerror = () => rechazar(pedido.error ?? new Error('Falló la cola'))
        // Cerrar al terminar: sin esto, una migración futura de la base se
        // queda esperando para siempre a que se suelten las conexiones.
        tx.oncomplete = () => db.close()
      }),
  )
}

/**
 * El aviso de que la cola cambió.
 *
 * IndexedDB no notifica a nadie cuando se escribe, así que la barra de
 * pendientes no se enteraría de un remito recién encolado hasta la próxima vez
 * que le tocara releer. Y una barra que tarda en aparecer es, durante ese rato,
 * exactamente el fallo silencioso que esta cola existe para evitar.
 */
export const EVENTO_COLA = 'infowell:cola-cambio'

function avisarCambio() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_COLA))
}

export async function encolar(remito: RemitoEnCola): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.put(remito))
  avisarCambio()
}

export async function pendientes(): Promise<RemitoEnCola[]> {
  const todos = await transaccion<RemitoEnCola[]>('readonly', (almacen) => almacen.getAll())
  return ordenarCola(todos)
}

export async function quitarDeLaCola(id: string): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.delete(id))
  avisarCambio()
}

/** Anota que se intentó y falló, para poder mostrar por qué. */
export async function anotarIntento(id: string, error: string): Promise<void> {
  const remito = await transaccion<RemitoEnCola | undefined>('readonly', (a) => a.get(id))
  if (!remito) return

  await encolar({ ...remito, intentos: remito.intentos + 1, ultimoError: error })
}
