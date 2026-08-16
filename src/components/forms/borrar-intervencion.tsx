'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/**
 * Eliminar una intervención, con confirmación.
 *
 * Es la única acción destructiva del formulario y borra el registro de una
 * visita entera —servicios, mediciones y observaciones—, así que no puede
 * dispararse con un toque. El texto dice qué se pierde, no solo "¿estás
 * seguro?".
 */
export function BorrarIntervencion({ action }: { action: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAbierto(true)}
        className="text-destructive w-full"
      >
        <Trash2 className="size-4" />
        Eliminar esta intervención
      </Button>

      <p className="text-muted-foreground mt-2 text-xs">
        Se saca del historial del pozo. Los remitos de la finca no se tocan.
      </p>

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta intervención?</AlertDialogTitle>
            <AlertDialogDescription>
              Se van a sacar del historial los servicios, las mediciones y las observaciones de
              esta visita. El pozo pierde este punto en su evolución.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Conservarla</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                // Se evita que el diálogo cierre antes de que termine la
                // acción: si no, el usuario ve la pantalla vieja un instante.
                e.preventDefault()
                iniciar(async () => {
                  await action()
                })
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
