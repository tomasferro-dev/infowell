import { describe, expect, it } from 'vitest'

import {
  BUCKET_MAPA,
  BUCKET_NOTAS_VOZ,
  BUCKET_REMITOS,
  SUBIDAS,
  recursoDeBucket,
  TIPOS_DE_SUBIDA,
  construirRuta,
  extensionDeMime,
  interpretarRuta,
  mimeAudioPermitido,
} from '@/lib/storage-paths'

/**
 * La ruta del archivo es un control de seguridad, no un detalle de
 * organización: el farmId va adentro, y de ahí sale el permiso para firmar la
 * URL. Si la ruta se puede falsificar, se puede leer el remito de otra finca.
 */
describe('construirRuta', () => {
  it('arma la ruta con la finca al frente', () => {
    const ruta = construirRuta({ farmId: 'finca-1', recursoId: 'pozo-9', ext: 'webm' })
    expect(ruta).toMatch(/^finca-1\/pozo-9\/[0-9a-f-]{36}\.webm$/)
  })

  it('genera un nombre distinto en cada llamada', () => {
    const a = construirRuta({ farmId: 'f', recursoId: 'r', ext: 'webm' })
    const b = construirRuta({ farmId: 'f', recursoId: 'r', ext: 'webm' })
    expect(a).not.toBe(b)
  })

  it('rechaza ids con barras, que permitirían escapar de la carpeta', () => {
    expect(() => construirRuta({ farmId: '../otra', recursoId: 'r', ext: 'webm' })).toThrow()
    expect(() => construirRuta({ farmId: 'f', recursoId: 'a/b', ext: 'webm' })).toThrow()
  })

  it('rechaza extensiones que no sean alfanuméricas', () => {
    expect(() => construirRuta({ farmId: 'f', recursoId: 'r', ext: '../x' })).toThrow()
  })
})

describe('interpretarRuta', () => {
  it('extrae la finca de una ruta válida', () => {
    const r = interpretarRuta('finca-1/pozo-9/abc.webm')
    expect(r?.farmId).toBe('finca-1')
  })

  it('rechaza rutas con salto de directorio', () => {
    expect(interpretarRuta('../secretos/x.webm')).toBeNull()
    expect(interpretarRuta('finca-1/../../x.webm')).toBeNull()
  })

  it('rechaza rutas absolutas', () => {
    expect(interpretarRuta('/etc/passwd')).toBeNull()
  })

  it('rechaza una ruta sin suficientes segmentos', () => {
    expect(interpretarRuta('archivo.webm')).toBeNull()
    expect(interpretarRuta('')).toBeNull()
  })
})

describe('mimeAudioPermitido', () => {
  it('acepta los formatos que produce MediaRecorder en los navegadores reales', () => {
    // Chrome/Android graba webm-opus; iOS Safari graba mp4.
    expect(mimeAudioPermitido('audio/webm')).toBe(true)
    expect(mimeAudioPermitido('audio/webm;codecs=opus')).toBe(true)
    expect(mimeAudioPermitido('audio/mp4')).toBe(true)
    expect(mimeAudioPermitido('audio/mpeg')).toBe(true)
  })

  it('rechaza cualquier cosa que no sea audio', () => {
    expect(mimeAudioPermitido('text/html')).toBe(false)
    expect(mimeAudioPermitido('application/javascript')).toBe(false)
    expect(mimeAudioPermitido('image/svg+xml')).toBe(false)
  })
})

describe('extensionDeMime', () => {
  it('mapea los tipos conocidos', () => {
    expect(extensionDeMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionDeMime('audio/mp4')).toBe('m4a')
    expect(extensionDeMime('audio/mpeg')).toBe('mp3')
  })

  it('cae en bin para un tipo desconocido', () => {
    expect(extensionDeMime('audio/vnd.rara')).toBe('bin')
  })
})

describe('qué se permite subir en cada tipo', () => {
  it('cada tipo cuelga del recurso que le corresponde', () => {
    // El permiso sale de acá, así que un error en esta tabla es un agujero:
    // una imagen del mapa que pidiera permiso de `receipt` la podría subir el
    // cargador, que no debe tocarla.
    expect(SUBIDAS['nota-voz'].recurso).toBe('observation')
    expect(SUBIDAS.remito.recurso).toBe('receipt')
    expect(SUBIDAS['imagen-mapa'].recurso).toBe('overlay')
  })

  it('cada tipo va a su propio bucket', () => {
    expect(SUBIDAS['nota-voz'].bucket).toBe(BUCKET_NOTAS_VOZ)
    expect(SUBIDAS.remito.bucket).toBe(BUCKET_REMITOS)
    expect(SUBIDAS['imagen-mapa'].bucket).toBe(BUCKET_MAPA)

    const buckets = TIPOS_DE_SUBIDA.map((t) => SUBIDAS[t].bucket)
    expect(new Set(buckets).size, 'dos tipos no pueden compartir bucket').toBe(buckets.length)
  })

  it('la nota de voz acepta audio y NADA más', () => {
    expect(SUBIDAS['nota-voz'].permite('audio/webm')).toBe(true)
    expect(SUBIDAS['nota-voz'].permite('image/jpeg')).toBe(false)
  })

  it('el remito y la imagen del mapa aceptan imagen y NADA más', () => {
    for (const tipo of ['remito', 'imagen-mapa'] as const) {
      expect(SUBIDAS[tipo].permite('image/jpeg'), tipo).toBe(true)
      expect(SUBIDAS[tipo].permite('image/png'), tipo).toBe(true)
      expect(SUBIDAS[tipo].permite('audio/webm'), tipo).toBe(false)
      expect(SUBIDAS[tipo].permite('application/pdf'), tipo).toBe(false)
      // Un ejecutable disfrazado con el mime de una imagen no existe, pero un
      // mime inventado sí: no se acepta lo que no está en la lista.
      expect(SUBIDAS[tipo].permite('image/svg+xml'), tipo).toBe(false)
    }
  })

  it('la extensión sale del mime, no del nombre que mandó el cliente', () => {
    expect(SUBIDAS.remito.extension('image/jpeg')).toBe('jpg')
    expect(SUBIDAS['imagen-mapa'].extension('image/png')).toBe('png')
    expect(SUBIDAS['nota-voz'].extension('audio/mp4')).toBe('m4a')
  })

  it('no hay más tipos que los tres declarados', () => {
    expect([...TIPOS_DE_SUBIDA].sort()).toEqual(['imagen-mapa', 'nota-voz', 'remito'])
  })
})

describe('de qué recurso es un bucket', () => {
  /**
   * Lo usa la ruta que SIRVE los archivos. Se deriva de la misma tabla que la
   * subida a propósito: dos tablas separadas se desincronizan, y el día que se
   * desincronicen alguien va a poder leer lo que no le corresponde.
   */
  it('devuelve el recurso de cada bucket conocido', () => {
    expect(recursoDeBucket(BUCKET_NOTAS_VOZ)).toBe('observation')
    expect(recursoDeBucket(BUCKET_REMITOS)).toBe('receipt')
    expect(recursoDeBucket(BUCKET_MAPA)).toBe('overlay')
  })

  it('devuelve null para un bucket que no existe', () => {
    // Null y no un recurso por defecto: quien lo llama tiene que decidir qué
    // hacer, y lo correcto es no servir nada.
    expect(recursoDeBucket('inventado')).toBeNull()
    expect(recursoDeBucket('')).toBeNull()
    expect(recursoDeBucket('../remitos')).toBeNull()
  })

  it('cubre todos los buckets de la tabla de subidas', () => {
    for (const tipo of TIPOS_DE_SUBIDA) {
      expect(recursoDeBucket(SUBIDAS[tipo].bucket), tipo).toBe(SUBIDAS[tipo].recurso)
    }
  })
})
