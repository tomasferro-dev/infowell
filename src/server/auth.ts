import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { authConfig } from '@/server/auth.config'
import { prisma } from '@/server/db'
import { puedeEntrarPorGoogle } from '@/server/entrada-google'

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

  callbacks: {
    ...authConfig.callbacks,

    /**
     * La puerta de Google es una LISTA BLANCA.
     *
     * Sin esto, cargar las credenciales de OAuth abriría InfoWell a cualquiera
     * con una cuenta de Google —o sea, a cualquiera— y acá hay datos de fincas
     * de clientes distintos. Google no crea cuentas: es otra forma de entrar
     * para quien ya la tiene. El alta la sigue haciendo el administrador, que
     * es quien sabe qué finca le corresponde a cada uno.
     *
     * Va acá y no en auth.config.ts porque consulta la base, y ese archivo lo
     * carga el middleware en el runtime edge, donde Prisma no existe.
     *
     * El provider de credenciales pasa de largo: ya decidió en `authorize`, y
     * volver a consultar sería una query de más en cada login.
     */
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true

      // Del email de Google, no del `user` que arma el adapter: es el dato que
      // Google verificó, y es contra el que se dio de alta a la persona.
      const email = user.email?.trim().toLowerCase()
      if (!email) return false

      /*
       * Insensible a mayúsculas: los emails se guardan tal como los escribe el
       * administrador y Google los manda en minúscula, así que una comparación
       * exacta dejaría afuera a alguien dado de alta como «Nahuel@…».
       *
       * `findMany` y no `findFirst`: si hubiera dos filas que solo difieren en
       * mayúsculas, `findFirst` elegiría una cualquiera. Que decida
       * `puedeEntrarPorGoogle`, que ante la duda niega.
       */
      const coincidencias = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { email: true, isActive: true },
      })

      return puedeEntrarPorGoogle(coincidencias)
    },
  },
})
