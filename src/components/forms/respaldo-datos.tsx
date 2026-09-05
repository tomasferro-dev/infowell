'use client'

import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { ResultadoRespaldo } from '@/server/actions/respaldo'

/**
 * Bajar los datos a un archivo y volver a cargarlos.
 *
 * Dice con todas las letras qué guarda y qué NO: un respaldo que promete más
 * de lo que contiene es peor que no tener ninguno — el día que haga falta, ya
 * es tarde para enterarse.
 */
export function RespaldoDatos({
  onExportar,
  onImportar,
}: {
  onExportar: () => Promise<{ archivo: string; contenido: string }>
  onImportar: (contenido: string) => Promise<ResultadoRespaldo>
}) {
  const [bajando, setBajando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  async function exportar() {
    setBajando(true)
    try {
      const { archivo: nombre, contenido } = await onExportar()

      // La descarga la arma el navegador con el texto que vino del servidor:
      // no hace falta que el archivo exista en ningún lado.
      const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)

      toast.success('Respaldo descargado')
    } catch {
      toast.error('No se pudo generar el respaldo')
    } finally {
      setBajando(false)
    }
  }

  async function importar(evento: React.ChangeEvent<HTMLInputElement>) {
    const elegido = evento.target.files?.[0]
    // Se limpia enseguida: sin esto, elegir el mismo archivo dos veces seguidas
    // no dispara nada y parece que el botón dejó de andar.
    evento.target.value = ''
    if (!elegido) return

    setSubiendo(true)
    try {
      const r = await onImportar(await elegido.text())

      if (!r.ok) {
        toast.error(r.error)
        return
      }

      toast.success(
        `${r.fincas} fincas, ${r.pozos} pozos y ${r.dibujos} dibujos` +
          (r.omitidos > 0 ? ` · ${r.omitidos} omitidos` : ''),
      )
    } catch {
      toast.error('No se pudo leer el archivo')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">Respaldo de los datos</h2>
        <p className="text-muted-foreground text-sm">
          Un archivo con las fincas, los pozos y todo lo dibujado en el mapa. Sirve para guardarse
          una copia o para pasar los datos a otra instalación.
        </p>
      </div>

      {/* Lo que NO guarda, antes de los botones: es lo que alguien necesita
          saber ANTES de confiarle sus datos, no después. */}
      <div className="bg-muted/40 flex gap-3 rounded-lg border p-3">
        <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="text-muted-foreground space-y-1 text-xs">
          <p className="text-foreground font-medium">No es una copia completa</p>
          <p>
            Quedan afuera los remitos, las notas de voz y las imágenes del mapa —sus fotos y
            audios no entran en un archivo de texto—, el historial de intervenciones y
            mediciones, y los usuarios.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 justify-start"
          disabled={bajando}
          onClick={exportar}
        >
          {bajando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          <span className="flex-1 text-left">Descargar respaldo</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-12 justify-start"
          disabled={subiendo}
          onClick={() => archivo.current?.click()}
        >
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          <span className="flex-1 text-left">Importar respaldo</span>
        </Button>

        <input
          ref={archivo}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={importar}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Importar no borra nada: actualiza lo que ya está y agrega lo que falta. Importar dos veces
        el mismo archivo deja lo mismo que importarlo una.
      </p>
    </section>
  )
}
