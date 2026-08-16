'use client'

import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Piezas compartidas por todos los formularios de la app.
 *
 * Todos los controles usan h-12 y text-base: en iOS, un input con fuente menor
 * a 16px dispara el zoom automático al enfocarlo, que en un formulario largo
 * es insoportable.
 */

export function Campo({
  name,
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; error?: string; hint?: string }) {
  const id = `campo-${name}`
  const errorId = `${id}-error`

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn('h-12 text-base', className)}
        {...props}
      />
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-destructive text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function CampoTexto({
  name,
  label,
  error,
  ...props
}: React.ComponentProps<typeof Textarea> & { label: string; error?: string }) {
  const id = `campo-${name}`

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} aria-invalid={!!error} className="text-base" {...props} />
      {error ? <p className="text-destructive text-xs font-medium">{error}</p> : null}
    </div>
  )
}

export function BotonGuardar({ children = 'Guardar' }: { children?: React.ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  )
}

export function ErrorGeneral({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null

  return (
    <p role="alert" className="text-destructive text-sm font-medium">
      {mensaje}
    </p>
  )
}
