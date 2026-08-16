# Deploy

## Variables de entorno en Vercel

Cargalas en **Production** y **Preview** (Project Settings → Environment Variables):

| Variable | Para qué | ¿Hace falta en el build? |
| --- | --- | --- |
| `DATABASE_URL` | Conexión de la app (pooler, puerto **6543**) | Sí |
| `AUTH_SECRET` | Firma de las sesiones | Sí |
| `NEXT_PUBLIC_SUPABASE_URL` | Storage (fotos y audios) | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage, solo del lado del servidor | Sí |
| `DIRECT_URL` | Conexión directa (puerto **5432**), solo para migrar | No |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Login con Google | No (opcionales) |

`DIRECT_URL` no se usa en el build, pero conviene tenerla cargada igual: es la
que necesitás si alguna vez corrés migraciones desde el entorno de Vercel.

Después de agregar o cambiar una variable hay que **volver a deployar**: Vercel
no reconstruye solo.

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
