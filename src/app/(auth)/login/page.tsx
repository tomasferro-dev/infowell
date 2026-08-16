import { LoginForm } from '@/app/(auth)/login/login-form'
import { LogoArenas } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { loginConGoogleAction } from '@/server/actions/auth'

const googleHabilitado = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams

  return (
    <main className="flex min-h-dvh flex-col">
      {/* La marca arriba, sin desperdiciar la mitad de la pantalla: en un
          teléfono alto, el formulario tiene que entrar sin scrollear. */}
      <div className="px-6 pt-10 pb-7">
        <div className="mx-auto w-full max-w-sm">
          {/* La empresa presenta al producto: primero de quién es, después
              cómo se llama y para qué sirve. */}
          <LogoArenas alto={44} />
          <div className="regla-marca mt-5 w-16" />
          <h1 className="mt-4 text-4xl font-bold tracking-tighter">InfoWell</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            El historial técnico de tus perforaciones: el estado de cada pozo, los trabajos
            realizados y los remitos.
          </p>
        </div>
      </div>

      <div className="bg-card flex-1 border-t px-6 py-8">
        <div className="mx-auto w-full max-w-sm space-y-5">
          <LoginForm callbackUrl={callbackUrl ?? '/'} />

          {googleHabilitado ? (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted-foreground text-xs">o</span>
                <Separator className="flex-1" />
              </div>

              <form action={loginConGoogleAction}>
                <input type="hidden" name="callbackUrl" value={callbackUrl ?? '/'} />
                <Button type="submit" variant="outline" className="h-12 w-full text-base">
                  Continuar con Google
                </Button>
              </form>
            </>
          ) : null}

          <p className="text-muted-foreground pt-2 text-center text-xs">
            ¿No tenés acceso? Pedíselo al administrador.
          </p>
        </div>
      </div>
    </main>
  )
}
