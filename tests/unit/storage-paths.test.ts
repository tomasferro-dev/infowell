import { describe, expect, it } from 'vitest'

import {
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
