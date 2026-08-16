import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { authConfig } from '@/server/auth.config'
import { prisma } from '@/server/db'

/**
 * Config completa de Auth.js (runtime Node). El middleware NO importa este
 * archivo: usa authConfig, que no arrastra Prisma al edge.
 */

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

/**
 * Un único error para credenciales inválidas, cuenta inexistente o cuenta
 * desactivada. Distinguirlos le confirmaría a un atacante qué emails existen.
 */
class LoginInvalido extends CredentialsSignin {
  code = 'credenciales_invalidas'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) throw new LoginInvalido()

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            isActive: true,
            passwordHash: true,
          },
        })

        // Sin usuario, sin hash (cuenta creada solo con Google) o dada de baja.
        if (!user?.passwordHash || !user.isActive) throw new LoginInvalido()

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!ok) throw new LoginInvalido()

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          isActive: user.isActive,
        }
      },
    }),
  ],
})
