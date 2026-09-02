# Deploy

## Variables de entorno en Vercel

Cargalas en **Production** y **Preview** (Project Settings → Environment Variables):

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión de la app (pooler, puerto **6543**) |
| `AUTH_SECRET` | Firma de las sesiones |
| `NEXT_PUBLIC_SUPABASE_URL` | Storage (fotos y audios) |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage, solo del lado del servidor |
| `DIRECT_URL` | Conexión directa (puerto **5432**), solo para migrar |
| `NEXT_PUBLIC_MAPTILER_KEY` | Imagen satelital del mapa |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Login con Google (opcionales) |

Después de agregar o cambiar una variable hay que **volver a deployar**: Vercel
no reconstruye solo.

### De dónde sale cada una en el panel de Supabase

Ninguna se llama igual en Supabase que acá. Estos son los nombres reales:

| Variable nuestra | Dónde está | Qué copiar |
| --- | --- | --- |
| `DATABASE_URL` | Project Settings → **Database** → Connection string → **Transaction pooler** | La que termina en `:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Misma pantalla → **Session pooler** | La misma pero en `:5432/postgres`, sin `pgbouncer` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → **API** → Project URL | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → **API Keys** | La **secret**, la que empieza con `sb_secret_` |

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

## Las migraciones NO corren en el build

El build es `prisma generate && next build`. A propósito **no** incluye
`prisma migrate deploy`.

La razón: hoy hay un solo proyecto de Supabase, así que Preview y Production
apuntan a la misma base. Si el build migrara, **cada deploy de preview
—cualquier rama, cualquier PR— correría migraciones contra los datos reales**.

Las migraciones se aplican a mano, desde tu máquina, cuando cambia el esquema:

```bash
npm run db:deploy
```

Ese comando usa `DIRECT_URL` de tu `.env` local. Corrélo **antes** de deployar
el código que depende del esquema nuevo, para que la base nunca quede atrás de
la aplicación.

### Cuándo conviene cambiar esto

Si más adelante separás producción y desarrollo en dos proyectos de Supabase,
ahí sí tiene sentido que el build de Production corra `prisma migrate deploy`,
porque cada entorno migra su propia base. Mientras haya una sola, se queda como
está.

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
prefijo `e2e-`). Mientras Preview y Production compartan base, no los corras
contra producción si ya hay datos reales cargados.

---

## Separar la base de desarrollo de la de producción

Hoy hay **una sola base** de Supabase: la usa la app publicada, tu desarrollo
local y los 290 tests, que crean y borran datos en cada corrida. Mientras no
hubo datos reales no importó. **Con el cliente cargando sus fincas, sí.**

Lo que hay que hacer es crear una base NUEVA para desarrollo y dejar la actual
como producción. Al revés —mudar producción— sería cambiar variables en Vercel
y migrar datos, sin ninguna ventaja.

### Lo que hace el usuario (una vez)

1. **Nuevo proyecto en Supabase.** Nombre sugerido: `infowell-dev`. La región
   no importa; conviene la misma que el de producción para que los tiempos se
   parezcan.
2. **Dos buckets privados**, con estos nombres exactos: `remitos` y
   `notas-voz`. Los nombres están fijos en `src/lib/storage-paths.ts`.
3. **Pasarle al desarrollador** cuatro valores del proyecto nuevo:
   `DATABASE_URL` (pooler, puerto 6543), `DIRECT_URL` (directa, puerto 5432),
   `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

⚠️ **Vercel no se toca.** Sigue apuntando al proyecto de siempre, que pasa a
ser producción y queda sin tests encima.

### Lo que sigue después (local)

Con las cuatro variables nuevas en el `.env`:

```bash
npm run db:deploy   # crea las tablas
npm run db:seed     # crea el admin
npm run db:demo     # datos de demostración, opcional
```

Y para verificar que quedó apuntando donde corresponde:

```bash
npm run db:donde
```

### Cómo saber en cuál estás parado

`npm run db:donde` imprime el proyecto de Supabase al que apunta el `.env`, sin
mostrar contraseñas. Vale la pena mirarlo antes de correr los tests: es la
diferencia entre borrar datos de prueba y borrar los del cliente.

### Y si igual hay que mover datos

`/admin/configuracion` → **Descargar respaldo** baja un JSON con las fincas,
los pozos y todo lo dibujado en el mapa, y **Importar respaldo** lo vuelve a
cargar en otra instalación. No incluye remitos, notas de voz ni el historial de
intervenciones: sus fotos y audios viven en el almacenamiento de archivos y no
entran en un archivo de texto. La pantalla lo dice.
