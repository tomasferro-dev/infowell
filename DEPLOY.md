# Deploy

## Variables de entorno en Vercel

En Project Settings → Environment Variables. **Cada entorno tiene su propio
valor para la misma clave**: Production apunta a la base del cliente y Preview a
`infowell-dev`. En el panel eso son dos entradas con el mismo nombre, cada una
tildada en un solo entorno —no se puede tener una sola tildada en los dos con
valores distintos—.

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión de la app (pooler, puerto **6543**) |
| `AUTH_SECRET` | Firma de las sesiones. **Distinto en Preview que en Production** |
| `SUPABASE_URL` | Storage (fotos y audios) |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage, solo del lado del servidor |
| `DIRECT_URL` | Conexión directa (puerto **5432**), solo para migrar |
| `NEXT_PUBLIC_MAPTILER_KEY` | Imagen satelital del mapa |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Login con Google (opcionales) |

Después de agregar o cambiar una variable hay que **volver a deployar**: Vercel
no reconstruye solo.

⚠️ **`SUPABASE_URL` se llamaba `NEXT_PUBLIC_SUPABASE_URL` y se renombró.** El
prefijo `NEXT_PUBLIC_` estaba de más: `src/server/storage.ts` es `server-only` y
ningún componente cliente lee esa variable, así que el prefijo la mandaba al
bundle del navegador sin que nadie la usara ahí. Además los `NEXT_PUBLIC_`
quedan **congelados en el build**, con el valor del momento de compilar. Si
quedó alguna con el nombre viejo dando vueltas, borrala.

### De dónde sale cada una en el panel de Supabase

Ninguna se llama igual en Supabase que acá. Estos son los nombres reales:

| Variable nuestra | Dónde está | Qué copiar |
| --- | --- | --- |
| `DATABASE_URL` | Project Settings → **Database** → Connection string → **Transaction pooler** | La que termina en `:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Misma pantalla → **Session pooler** | La misma pero en `:5432/postgres`, sin `pgbouncer` |
| `SUPABASE_URL` | Project Settings → **API** → Project URL | `https://<ref>.supabase.co`, **sin nada detrás** |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → **API Keys** | La **secret**, la que empieza con `sb_secret_` |

⚠️ **La Project URL va pelada.** El panel la muestra en varios lugares con
un camino pegado —`…supabase.co/rest/v1/` en la sección de REST— y esa
variante entra sin quejarse: falla después, al usar Storage, con un
`Invalid path specified in request URL` que no menciona la URL. Tiene que
terminar en `.supabase.co`.

En las dos primeras, `[YOUR-PASSWORD]` hay que reemplazarlo por la contraseña
de la base —la que se eligió al crear el proyecto—. Si se perdió, se cambia en
Database → Database password; no hay forma de verla de nuevo.

Así se ven, con la clave tapada:

```
DATABASE_URL=postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

⚠️ **Las dos van por el pooler, no por «Direct connection».** La conexión
directa (`db.<ref>.supabase.co`) es solo IPv6, y en la mayoría de las redes
—incluida la de Vercel— no resuelve. Usar el pooler en los dos puertos es lo
que ya funciona hoy.

⚠️ **No existe ninguna clave llamada «service_role key» en los proyectos
nuevos.** Ese era el nombre viejo, un JWT que empezaba con `eyJ`. Ahora son dos:

- **publishable** (`sb_publishable_…`) — pública, va al navegador. **No sirve**
  para lo que hace la app.
- **secret** (`sb_secret_…`) — la que necesitamos. Solo del lado del servidor.

Es el error clásico: la publicable *parece* una clave secreta, la app arranca
igual, y recién falla al subir una foto con un mensaje que no dice nada de
esto. `/api/diagnostico` lo detecta y lo nombra.

### La clave de MapTiler es pública, y eso está bien

`NEXT_PUBLIC_MAPTILER_KEY` viaja al navegador por definición: el mapa pide los
tiles desde el teléfono del usuario. No hay forma de esconderla, y no la hay en
ningún mapa web.

Lo que la protege es la lista de **Allowed HTTP Origins** en el panel de
MapTiler. Cuando esté el dominio, cargar ahí:

```
infowell.com.ar
*.infowell.com.ar
*.vercel.app
localhost:3000
```

Sin esa lista la clave sirve desde cualquier sitio y un tercero puede gastar la
cuota. Con la lista cargada, sirve solo desde los orígenes propios.

Si el mapa deja de cargar imagen y todo lo demás anda, ese es el primer lugar
para mirar: la app no puede distinguir "clave sin cuota" de "origen
rechazado".

### El build no necesita ninguna

Son todas de ejecución. El build compila sin ninguna variable cargada —hay una
verificación de eso: borrar el `.env` y correr `npm run build` tiene que
terminar bien.

Esto es deliberado. Si un módulo lanzara un error al importarse por una
variable faltante, `next build` se caería al recolectar los datos de las
páginas, y un problema de configuración se disfrazaría de error de
compilación. Por eso `src/server/storage.ts` crea su cliente en el primer uso
y `src/server/db.ts` no lanza en el cuerpo del módulo.

**Si agregás un módulo que lea `process.env`, no valides en el cuerpo del
módulo: validá adentro de la función que lo usa.**

## Las migraciones corren en el build, y solo en produccion

El build es:

```
preparar-worker-mapa && prisma generate && migrar-en-build && next build
```

`scripts/migrar-en-build.ts` corre `prisma migrate deploy` **unicamente si
`VERCEL_ENV` vale `production`**. Asi el deploy de Production migra su propia
base y el esquema nunca queda atras de la aplicacion, sin que haya que
acordarse de aplicarlo a mano antes de cada deploy.

### Por que la guarda, si Preview ya tiene su propia base

Preview apunta a `infowell-dev`, asi que hoy un preview no podria tocar los
datos del cliente aunque migrara. La guarda no sobra por eso.

Que Preview tenga otra base es una configuracion del panel de Vercel, no algo
que este repositorio pueda garantizar. Alcanza con que alguien copie las
variables de Production a Preview —o cree el proyecto de nuevo— para que
vuelvan a apuntar a la misma base, y ahi la guarda es lo unico que impide que
una rama con un `schema.prisma` a medio hacer le migre el esquema a los datos
reales. **Una proteccion que depende de que nadie toque un panel no es una
proteccion.**

Con la guarda, un preview imprime que se saltea y sigue de largo.

### A mano, cuando hace falta

Sigue estando `npm run db:deploy`, que usa el `DIRECT_URL` del `.env` local y
aplica las migraciones a produccion desde tu maquina. Ya no es obligatorio
antes de cada deploy, pero sirve para aplicar un cambio de esquema sin esperar
al build.

Contra la base de desarrollo, `npm run db:deploy:dev`.

### Si la migracion falla

El build corta con el codigo de error de Prisma y **la version no se publica**.
Es a proposito: publicar la aplicacion con la base atras del codigo es peor que
no publicarla, porque falla en la cara del usuario y no en el registro del
deploy.

## Dominio propio (DonWeb)

No hace falta para nada: la URL `.vercel.app` ya viene con HTTPS, que es lo
único que exigen la cámara y el micrófono.

Cuando lo compres:

1. Vercel → Project Settings → Domains → agregar el dominio.
2. Vercel muestra los registros DNS exactos (un `A` para el dominio raíz y un
   `CNAME` para `www`). **Copiar esos valores**, no los de ningún tutorial: las
   IP de Vercel cambiaron en el pasado.
3. Cargarlos en la zona DNS del panel de DonWeb.
4. Esperar la propagación (hasta 24-48 h). El certificado SSL lo emite Vercel
   solo.

## Login con Google

Queda desactivado hasta que existan las dos variables `AUTH_GOOGLE_*`; el botón
ni se muestra. Para habilitarlo:

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID
   (tipo *Web application*).
2. En **Authorized redirect URIs** agregar una por cada URL desde la que se
   entre:
   - `https://<tu-proyecto>.vercel.app/api/auth/callback/google`
   - `https://<tu-dominio>/api/auth/callback/google` (cuando exista)
   - `http://localhost:3000/api/auth/callback/google` (para desarrollo)
3. Cargar `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` en Vercel y redeployar.

## Verificar un deploy

La suite de e2e corre contra cualquier URL:

```bash
E2E_BASE_URL=https://tu-app.vercel.app npx playwright test --project=mobile
```

⚠️ Los tests **crean y borran datos** (fincas, pozos, usuarios y remitos con el
prefijo `e2e-`). **Nunca los corras contra la URL de producción**: `E2E_BASE_URL`
saltea la traba de separación a propósito —contra una URL externa no hay `.env`
local que valga—, así que ahí la única proteccion sos vos. Ya pasó una vez:
quedaron cuatro fincas de prueba a la vista del cliente.

---

## Separar la base de desarrollo de la de producción

✅ **Ya está hecho.** Producción es `erdpbfcidqxfcxahnwjp` y desarrollo es
`nqlfszunnqbqfeulpugc` (`infowell-dev`). Queda escrito porque explica cómo está
armado y qué repetir si alguna vez hay que rehacer la base de desarrollo.

El motivo fue que una sola base la usaban la app publicada, el desarrollo local
y los 300 tests, que crean y borran datos en cada corrida. Mientras no hubo
datos reales no importó; con el cliente cargando sus fincas, sí.

Se creó una base NUEVA para desarrollo y la de siempre quedó como producción.
Al revés —mudar producción— habría sido cambiar variables en Vercel y migrar
datos, sin ninguna ventaja.

### Lo que hizo el usuario (una vez)

1. **Nuevo proyecto en Supabase.** Nombre sugerido: `infowell-dev`. La región
   no importa; conviene la misma que el de producción para que los tiempos se
   parezcan.
2. **Dos buckets privados**, con estos nombres exactos: `remitos` y
   `notas-voz`. Los nombres están fijos en `src/lib/storage-paths.ts`.
   También los crea `npm run db:buckets:dev`, que es parte de
   `db:preparar:dev` y no pisa nada si ya existen.
3. **Pasarle al desarrollador** cuatro valores del proyecto nuevo:
   `DATABASE_URL` (pooler, puerto 6543), `DIRECT_URL` (directa, puerto 5432),
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

⚠️ **Vercel no se toca.** Sigue apuntando al proyecto de siempre, que pasa a
ser producción y queda sin tests encima.

### El `.env` NO se toca

Las credenciales de desarrollo van en un archivo aparte, **`.env.test`**, con
solo esas cuatro líneas:

```
DATABASE_URL=…
DIRECT_URL=…
SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…
```

El `.env` queda como está —producción, lo mismo que hay en Vercel— y nunca más
se edita. `.env.test` se pone *encima* solo para los tests y para los comandos
de base contra desarrollo; el resto de las variables (`AUTH_SECRET`,
`SEED_ADMIN_*`, `NEXT_PUBLIC_MAPTILER_KEY`) se siguen tomando del `.env`.

Antes esto se resolvía cambiando el `.env` de ida y vuelta a mano. Funciona
hasta el día que uno se olvida de volver atrás y corre trescientos tests
—que crean y borran— contra los datos del cliente.

### Preparar la base de desarrollo

```bash
npm run db:preparar:dev
```

Corre las migraciones, el seed, los buckets y los datos de demostración contra
`.env.test`. También están sueltos: `db:deploy:dev`, `db:seed:dev`,
`db:buckets:dev`, `db:demo:dev`.

Los buckets van antes que los datos de demostración a propósito: esos datos
suben fotos de remitos, y sin bucket cortan a la mitad.

### La traba

Los tests **no arrancan** si falta `.env.test` o si apunta al mismo proyecto
que el `.env`. Cortan antes de tocar nada, con un mensaje que dice qué falta.

No es un aviso en la documentación: es una traba en `playwright.config.ts`. Un
descuido de un minuto se lleva datos que no se recuperan.

Para ver dónde está parado cada uno, sin mostrar contraseñas:

```bash
npm run db:donde
```

### Y si igual hay que mover datos

`/admin/configuracion` → **Descargar respaldo** baja un JSON con las fincas,
los pozos y todo lo dibujado en el mapa, y **Importar respaldo** lo vuelve a
cargar en otra instalación. No incluye remitos, notas de voz ni el historial de
intervenciones: sus fotos y audios viven en el almacenamiento de archivos y no
entran en un archivo de texto. La pantalla lo dice.
