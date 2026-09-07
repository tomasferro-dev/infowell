'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { BotonGuardar, Campo, CampoTexto, ErrorGeneral } from '@/components/forms/form-parts'
import { PhotoCapture } from '@/components/forms/photo-capture'
import { Label } from '@/components/ui/label'
import { encolar, esFalloDeRed } from '@/lib/cola-remitos'
import { enviarRemito } from '@/lib/enviar-remito'

/**
 * Alta de remito, optimizada para el Cargador: fecha ya puesta, monto con
 * teclado numérico y la cámara a un toque. El objetivo es cargarlo en menos de
 * un minuto, parado en el campo.
 *
 * El envío pasa por `enviarRemito`, el mismo camino que usa la cola al
 * reintentar. Si falla por RED, el remito entero —datos y fotos— se guarda en
 * el teléfono y se lo dice con todas las letras: nunca dice «guardado» cuando
 * en realidad quedó esperando.
 *
 * Se dejó de usar `useActionState`: el envío ahora ocurre en el cliente porque
 * es el único lugar donde se puede decidir encolar. Se pierde el envío sin
 * JavaScript, que en esta pantalla ya no existía —sacar una foto lo exige—.
 */
export function RemitoForm({
  farmId,
  fechaPorDefecto,
}: {
  farmId: string
  fechaPorDefecto: string
}) {
  const router = useRouter()
  const [fotos, setFotos] = useState<Blob[]>([])
  const [preparandoFotos, setPreparandoFotos] = useState(false)
  const [error, setError] = useState<string>()
  const [guardando, setGuardando] = useState(false)

  const recibirFotos = useCallback((nuevas: Blob[], preparando: boolean) => {
    setFotos(nuevas)
    setPreparandoFotos(preparando)
  }, [])

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    setGuardando(true)

    // Se guarda la referencia: después del await, `e.currentTarget` ya es null.
    const formulario = e.currentTarget
    const datos = new FormData(formulario)
    const remito = {
      id: crypto.randomUUID(),
      farmId,
      campos: Object.fromEntries(
        [...datos.entries()].filter((par): par is [string, string] => typeof par[1] === 'string'),
      ),
      fotos,
      creadoEl: Date.now(),
      intentos: 0,
    }

    try {
      await enviarRemito(remito)
      router.push(`/fincas/${farmId}/remitos`)
      router.refresh()
      return
    } catch (fallo) {
      if (!esFalloDeRed(fallo)) {
        // El servidor contestó y rechazó: encolarlo sería reintentar para
        // siempre algo que nunca va a andar.
        setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el remito')
        setGuardando(false)
        return
      }
    }

    try {
      await encolar(remito)

      /*
       * NO se navega. Sin señal, ir al listado de remitos lleva a la pantalla
       * de «Sin conexión», donde el operario no ve nada de lo que acaba de
       * cargar — el fallo silencioso otra vez, con más pasos. Se queda acá,
       * con el aviso de pendientes a la vista y el formulario limpio para
       * cargar el siguiente, que es lo que va a hacer.
       */
      formulario.reset()
      setFotos([])
      setPreparandoFotos(false)
      setGuardando(false)

      // «Guardado en el teléfono», nunca «guardado» a secas: la diferencia es
      // justamente lo que evita que el operario crea que subió y no subió.
      toast.success('Sin señal: el remito quedó guardado en el teléfono y sube solo.')
    } catch {
      setError(
        'No hay señal y este navegador no puede guardar el remito para después. ' +
          'Anotá los datos y cargalo cuando tengas señal.',
      )
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="issueDate"
          label="Fecha del remito"
          type="date"
          required
          defaultValue={fechaPorDefecto}
        />

        <Campo
          name="amount"
          label="Monto"
          required
          // decimal abre el teclado numérico con coma en Android e iOS.
          inputMode="decimal"
          placeholder="15.000,50"
          hint="Se acepta 15.000,50 o 15000.50"
        />
      </div>

      <Campo name="number" label="N° de remito" hint="Opcional, si el papel lo trae." />

      <div className="space-y-2">
        <Label>Fotos del remito</Label>
        <PhotoCapture onFotos={recibirFotos} />
      </div>

      <CampoTexto
        name="description"
        label="Detalle"
        rows={3}
        placeholder="Opcional: qué incluye este remito."
      />

      <ErrorGeneral mensaje={error} />

      {/* Bloqueado mientras se achica una foto: guardar en ese momento dejaría
          el remito sin ella y sin avisar. */}
      <BotonGuardar ocupado={guardando || preparandoFotos}>
        {preparandoFotos ? 'Preparando las fotos…' : 'Guardar remito'}
      </BotonGuardar>
    </form>
  )
}
