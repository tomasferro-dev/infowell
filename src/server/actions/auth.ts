'use server'

import { AuthError } from 'next-auth'
import { z } from 'zod'

import { signIn, signOut } from '@/server/auth'

const loginSchema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

export type LoginState = {
  error?: string
}

/**
 * Login por email + contraseña.
 *
 * Cualquier fallo devuelve el MISMO mensaje: no se distingue "no existe el
 * usuario" de "la contraseña está mal", porque esa diferencia le permitiría a
 * un atacante enumerar qué emails tienen cuenta.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const callbackUrl = (formData.get('callbackUrl') as string) || '/'

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    })
  } catch (error) {
    // signIn lanza un redirect interno cuando sale bien: hay que dejarlo pasar.
    if (error instanceof AuthError) {
      return { error: 'Email o contraseña incorrectos' }
    }
    throw error
  }

  return {}
}

export async function loginConGoogleAction(formData: FormData) {
  const callbackUrl = (formData.get('callbackUrl') as string) || '/'
  await signIn('google', { redirectTo: callbackUrl })
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' })
}
