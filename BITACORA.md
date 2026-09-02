# Bitácora de InfoWell

> Documento de contexto completo del proyecto. Si retomás InfoWell en una
> sesión nueva —con este modelo o con otro— **leé esto primero y no hace falta
> nada más**: ni memoria previa, ni explorar el código para entender por qué
> las cosas son como son.
>
> Última actualización: 16 de agosto de 2026.

---

## 1. Qué es InfoWell y para quién

**InfoWell** es una PWA mobile-first para **ARENAS Perforaciones**, una empresa
de Mendoza (Argentina) que perfora y mantiene pozos de agua para fincas y
bodegas de la zona vitivinícola.

Reemplaza el registro informal —papel, WhatsApp, fotos sueltas en el teléfono—
por dos cosas:

1. **El historial técnico de cada pozo**: qué servicios se le hicieron, cómo
   evolucionaron sus mediciones en el tiempo, qué observó el técnico.
2. **El legajo de remitos de cada finca**, con fotos.

### Los tres usuarios, que son muy distintos entre sí

| Rol | Quién es | Qué hace | Dónde |
|---|---|---|---|
| **ADMIN** | La oficina | Todo: fincas, pozos, intervenciones, catálogos, usuarios | Escritorio y celular |
| **CARGADOR** | El operario | **Solo** carga remitos (fotos + fecha + monto) | Celular, en el campo, con guantes, sol y 4G malo |
| **CLIENTE** | El dueño de la finca | **Solo lectura**, y **solo de su finca** | Celular |

**El requisito más crítico del proyecto es que un CLIENTE nunca vea datos de
una finca que no es suya.** Todo lo demás se negocia; esto no.

---

## 2. Estado actual

**La app está terminada y deployada.** Las 9 fases del plan original están
completas, más identidad visual, el renombre a InfoWell y el **mapa satelital**
(§11) — ninguno de los tres estaba en el plan.

- **Repo**: `https://github.com/tomasferro-dev/infowell` (rama `main`)
- **Local**: `D:\Escritorio\DEV\ARENAS\app-gestion`
- **Deploy**: Vercel, automático desde `main`
- **Base y archivos**: un único proyecto de Supabase (⚠️ ver §10)
- **Datos**: cargados de demostración (§8)

### Verificación en verde al cierre

```
tsc          0 errores
eslint       0 errores
vitest       156 tests
playwright   302 tests e2e (contra Supabase real, 2 viewports)
build sin .env   compila
```

---

## 3. Stack y por qué

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript | Server Actions y Server Components: la autorización vive del lado del servidor por defecto |
| Estilos | **Tailwind v4** + **shadcn** (base Radix, preset nova) | — |
| Base | **Supabase Postgres** | Base + Storage en un proveedor |
| ORM | **Prisma 7** | Schema legible, migraciones robustas |
| Auth | **Auth.js v5** (beta) + Prisma Adapter | Los usuarios viven en nuestra base, que es lo que necesita el filtro por finca |
| Archivos | **Supabase Storage**, buckets privados | — |
| Tests | **Vitest** (unitarios) + **Playwright** (e2e) | — |

**Todo funciona en planes gratuitos.** No hay motivo para pasar a pago con el
volumen previsto.

### Versiones que importan

Next 16, React 19, Tailwind 4, Prisma 7.9, Zod 4, `next-auth` 5 beta.
**Varias de estas rompen lo que un modelo puede tener memorizado** — ver §9.

---

## 4. Cómo está organizado

```
src/
  app/
    (auth)/login/            ingreso
    (app)/                   todo lo autenticado
      layout.tsx             barrera de sesión + header + nav inferior
      page.tsx               inicio por rol
      error.tsx              pantalla de error con reintentar
      not-found.tsx          "no encontrado"
      fincas/[farmId]/       layout con guard + pozos + remitos
      admin/                 layout con guard + usuarios + catálogos
    api/
      auth/[...nextauth]/    Auth.js
      uploads/sign/          firma de subida a Storage
      files/[bucket]/[...]/  sirve archivos privados
      diagnostico/           chequeo de configuración (solo admin)
  server/
    authz.ts                 núcleo PURO de permisos
    guards.ts                envoltorio con sesión y base
    db.ts                    cliente Prisma
    storage.ts               Supabase Storage
    actions/                 Server Actions por dominio
    queries/                 lecturas, siempre acotadas por finca
  components/
    forms/  data/  layout/  ui/
  lib/
    validation/              esquemas Zod compartidos
prisma/
  schema.prisma  seed.ts  datos-demo.ts  migrations/
tests/
  unit/  e2e/
```

### Reglas transversales

- **Server Actions + Zod para todo el CRUD.** Las rutas `/api` son solo para
  Auth.js y archivos.
- **Ninguna query de negocio sin `farmId` en el `where`.**
- El middleware **solo** verifica que exista sesión (corre en edge, no puede
  tocar la base). El permiso real se valida siempre server-side.
- Los `Decimal` y `Date` de Prisma **no cruzan** a Client Components: se
  serializan en la capa de queries.

---

## 5. Modelo de datos

```
User ─┬─(N:N vía FarmMember)─ Farm ─┬─ Well ─┬─ Intervention ─┬─ InterventionService ─ ServiceType
      │                             │        │                ├─ WellStatusReading ─ Pump
      └─(autoría en todo)           │        │                └─ Observation ─ VoiceNote
                                    │        ├─ WellStatusReading   (interventionId nullable)
                                    │        └─ Observation         (interventionId nullable)
                                    └─ Receipt ─ ReceiptPhoto
```

### Decisiones de modelado y su razón

- **`User ↔ Farm` es N:N** (`FarmMember`), no 1:N. Una finca tiene varios
  interesados (dueño, administrador, contador) y una persona puede administrar
  varias fincas. **De esta tabla depende toda la autorización del CLIENTE.**
- **`Intervention` es el contenedor de los tres módulos** (servicios +
  mediciones + observaciones). En el campo los tres ocurren en la misma visita;
  pedir tres formularios garantiza que el segundo y el tercero no se carguen.
- `WellStatusReading` y `Observation` **también** cuelgan del pozo con
  `interventionId` nullable, para permitir una medición de control suelta.
- **Mediciones y montos en `Decimal`, nunca `Float`.** El cliente compara
  valores entre visitas; el redondeo binario muestra `41.99999999`.
- **Catálogos extensibles** (`ServiceType`, `Pump`) con slug único
  anti-duplicados. Los 13 servicios base entran por seed con `isSystem: true`:
  no se borran, solo se desactivan.
- **Soft delete** (`deletedAt`) en todo lo de negocio. Los usuarios se
  desactivan (`isActive`), no se borran: su id lo referencian remitos e
  intervenciones.
- **`Observation.body` es nullable**: una observación puede ser solo audio.
- **`VoiceNote` ya tiene `transcript`, `transcriptStatus` y `transcribedAt`**
  aunque nada los escriba todavía. Sumar transcripción es rellenar columnas
  existentes, sin migración.

---

## 6. Seguridad — leer antes de tocar cualquier query

### El modelo

`src/server/authz.ts` es una función **pura** (sin Prisma, sin Next, sin
sesión): `authorize(actor, action, resource, farmId)`. Está aislada así para
poder probarla exhaustivamente, porque de ella depende el aislamiento entre
fincas.

`src/server/guards.ts` la envuelve con sesión y base:
`requireActor`, `requireAccess`, `can`, `visibleFarmIds`.

### Las reglas

| | ADMIN | CARGADOR | CLIENTE |
|---|---|---|---|
| Leer su finca | ✅ (todas) | ✅ | ✅ |
| Escribir remitos | ✅ | ✅ | ❌ |
| Escribir pozos/intervenciones | ✅ | ❌ | ❌ |
| Usuarios y catálogos | ✅ | ❌ | ❌ |

### Cinco decisiones que no hay que revertir sin pensarlo

1. **Fallar con 404, no con 403.** Un 403 en `/fincas/{id}` le confirma a un
   curioso que esa finca existe. Para quien no tiene acceso, no existe.
2. **Fail-closed sin scope.** Un recurso de finca sin `farmId` se deniega. Ese
   olvido es la forma más común de filtrar datos entre clientes.
3. **Las fincas del actor se leen frescas de la base en cada request**, no del
   JWT. Así revocarle el acceso a un cliente tiene efecto inmediato y no al
   vencer su sesión (30 días). Se deduplica con `cache()` de React.
4. **El `farmId` nunca viaja en un formulario.** Se fija con
   `.bind(null, farmId)` del lado del servidor.
5. **Los updates usan `updateMany` con `{ id, farmId }` en el `where`.** Aunque
   alguien conozca el id de un pozo ajeno, no afecta ninguna fila.

### La auditoría

`tests/e2e/auditoria-idor.spec.ts` es el **inventario vivo de superficie de
ataque**: barre toda ruta que reciba un id, con cada rol, incluyendo ids
cruzados (finca propia + pozo ajeno).

**Cuando agregues una ruta con parámetros, va ahí.**

⚠️ **Compromiso conocido**: `loading.tsx` hace que Next transmita la respuesta,
así que la cabecera HTTP sale con **200 antes** de que corra el guard. Un
`notFound()` posterior muestra la pantalla correcta pero con estado 200. Los
layouts de segmento **no** lo evitan (se probó). Por eso la auditoría verifica
el **contenido** —que llegue la pantalla de "no encontrado" y ningún dato— en
vez del número. Es una garantía más fuerte: un 404 nunca demostró que no se
filtrara nada. Los endpoints de `/api` **sí** devuelven el estado correcto.

### Archivos privados

- Buckets **privados** `remitos` y `notas-voz`.
- Ruta: `{farmId}/{recursoId}/{uuid}.{ext}`. **El farmId al frente no es
  organización: es de donde sale el permiso para firmar.** Los ids se validan
  contra `[A-Za-z0-9_-]` para impedir escapar de la carpeta.
- **Nunca se guarda una URL firmada en la base**, solo el `storagePath`. La URL
  se emite en cada request tras revalidar el permiso; si se guardara, revocar
  acceso no invalidaría los enlaces ya entregados.
- La subida va **directo del navegador a Storage** con URL firmada: evita el
  límite de body de las Server Actions y no consume ancho de banda de Vercel.
- Las rutas vuelven del navegador al enviar el formulario, así que la action
  **revalida** que apunten a la finca correcta.

---

## 7. Identidad visual

Los colores salen del **logo real**, muestreados del PNG:

| Uso | Color | Contraste |
|---|---|---|
| Acciones y estructura | Carbón `#383a3c` | 11.4:1 |
| Identidad y acentos | Rojo ARENAS `#ec1f25` | 4.38:1 — **nunca texto de cuerpo** |
| Destructivo | Rojo oscuro `#a8161b` | 7.5:1 |

**La tensión que resuelve**: el rojo de marca es también el color convencional
de "borrar". Si Guardar y Archivar fueran los dos rojos, el operario no los
distinguiría. En el logo, el carbón es la **masa** y el rojo es el **acento** y
la **regla que divide** ARENAS de Perforaciones — la app respeta esa jerarquía.
Por eso lo destructivo usa un rojo más oscuro.

- **Tipografía**: **Archivo**, de Omnibus-Type (Buenos Aires). Llega a los pesos
  altos y condensados del lettering del logo, y es una fundición argentina.
- **Dispositivo estructural**: la regla roja de 3px (`.regla-marca`) es el
  único elemento decorativo, y divide de verdad (bajo el header, ítem activo).
- **Radius bajo** (0.375rem): el logo es todo diagonales y cortes rectos.
- **Paleta de datos aparte** (`--chart-1` azul, `--chart-2` naranja), fuera de
  la marca a propósito: si el caudal fuera rojo competiría con el acento.
  Validada para daltonismo (CVD ΔE 24.7 claro / 26.8 oscuro).

### El elemento distintivo: el perfil del pozo

`src/components/data/perfil-pozo.tsx` dibuja el **corte vertical a escala** del
pozo: terreno, entubado, nivel estático, nivel dinámico, abatimiento acotado,
bomba y fondo. Es el dibujo que hace un perforista en papel.

Existe por una razón concreta: al dueño de una finca "nivel dinámico 58 m" no
le dice nada, pero el dibujo se entiende solo. SVG en el servidor, sin JS, con
descripción alternativa completa.

---

## 8. Reglas de negocio implementadas

Estas son **decisiones de dominio**, no detalles técnicos. Si algo parece raro,
probablemente esté acá el motivo.

1. **El nivel dinámico no puede ser más somero que el estático.** Se mide con la
   bomba en marcha, así que el agua está siempre igual o más abajo. Si viene al
   revés, el formulario avisa *"¿Están cruzados?"*. Es el error típico de
   completar rápido en el campo.
2. **No se acepta una intervención vacía.** Sin servicios, sin mediciones y sin
   observación no se crea nada: evita llenar el historial de visitas fantasma.
3. **Una nota de voz sola alcanza** para que la visita sea válida.
4. **Los montos se interpretan en formato argentino**, resolviendo la
   ambigüedad del punto por el tamaño del último grupo: `15.000` son quince mil,
   `15000.50` son quince mil con cincuenta. Si no hay nada interpretable
   devuelve `null`, **nunca 0** (un cero sería válido y silenciaría el error).
5. **El CUIT se valida con dígito verificador** (módulo 11), no solo formato.
6. **Las fechas por defecto se calculan en hora local**, no con
   `toISOString()`: en Argentina, después de las 21 h eso devuelve mañana.
7. **Editar una intervención deja constancia** ("editada el …"). El cliente ve
   estos datos y corresponde que sepa que se corrigieron.
8. **Eliminar una intervención es baja lógica.** Los datos técnicos son
   historial.
9. **En los catálogos nunca hay borrado**, solo activar/desactivar: un servicio
   referenciado por intervenciones históricas rompería el historial.
10. **El alta al vuelo no falla si ya existe**: devuelve el existente y avisa
    "ya existía". El usuario quería tenerlo seleccionable, y eso se cumple.
11. **La búsqueda de catálogos ignora acentos.** Nadie en el campo escribe
    "Perforación" con tilde; si no lo encuentra, crea un duplicado.

### Datos de demostración

`npm run db:demo` — **destructivo y reproducible**. Borra fincas, pozos,
intervenciones, remitos y usuarios no-ADMIN, y carga:

- 4 fincas de Mendoza (Luján de Cuyo, Tunuyán, San Rafael, Maipú)
- 7 pozos numerados, 23 intervenciones repartidas en dos años
- Los niveles **bajan de a poco entre visitas**, como pasa de verdad en los
  acuíferos de la zona, para que el gráfico de evolución muestre una tendencia
- 7 remitos con foto generada

Conserva el admin (`admin@arenas.com.ar`) y los 13 servicios base.

---

## 9. Trampas técnicas — esto ahorra horas

Todo lo de acá se descubrió peleándolo. Varias contradicen lo que un modelo
puede tener memorizado.

### Prisma 7

- El generator es **`prisma-client`**, NO `prisma-client-js`. Requiere `output`
  y `importFileExtension = ""`.
- El `datasource` del schema **ya no lleva `url`**: va en `prisma.config.ts`.
- El runtime necesita **driver adapter obligatorio** (`@prisma/adapter-pg`).
- **No carga los `.env` solo**: hay que `import 'dotenv/config'` en la config.
- Usar `env('DIRECT_URL')` en `prisma.config.ts` **rompe `npm install`** en un
  clon sin `.env` (el postinstall corre `prisma generate` y `env()` aborta).
  Se usa `process.env.DIRECT_URL ?? ''`.
- `prisma migrate dev` **no siempre regenera el cliente**: si `tsc` ve tipos
  viejos, correr `prisma generate` a mano.
- **NO tocar las opciones del pool.** Fijar `max`, `idleTimeoutMillis` o
  `statement_timeout` produce `DriverAdapterError: ConnectionClosed` en medio de
  las transacciones: el pool cierra conexiones todavía en uso. Solo está
  `connectionTimeoutMillis`, que evita que un request espere para siempre.

### Variables de entorno

- **Nunca validar con `throw` en el cuerpo de un módulo.** `next build` importa
  cada ruta para recolectar datos; un throw al importar rompe el build entero y
  ata el build a secretos de ejecución. La validación va **dentro de la función
  que las usa** (ver `storage.ts`).
- **Verificación obligatoria antes de deployar**: renombrar el `.env` y correr
  `npm run build`. Tiene que terminar en 0.
- Se limpian espacios, saltos de línea y comillas al leerlas: copiar y pegar en
  un panel web arrastra basura invisible. **Un deploy se rompió porque la URL
  terminaba en `supabase.c` en vez de `supabase.co`.**
- `/api/diagnostico` (solo admin) reporta la **forma** de cada variable
  —espacios, comillas, saltos, protocolo— y prueba la conexión real. Un
  booleano "presente: true" no alcanza: la variable estaba presente y rota.

### Supabase Storage

- Contrato real de `uploadToSignedUrl` (leído del dist, no adivinado):
  **PUT** a `${url}/object/upload/sign/${bucket}/${path}?token=…` con
  **FormData multipart** donde el archivo va con **clave vacía**
  (`fd.append('', blob)`). Por eso el navegador sube con `fetch` plano, sin
  cliente de Supabase ni clave pública en el bundle.
- La clave correcta es la **secreta nueva** (`sb_secret_…`).
  `SUPABASE_SECRET_KEYS` es solo para Edge Functions y **no aplica** acá.
- **`fetch failed` NUNCA es un error de autenticación**: la petición no llegó a
  salir. Es la URL.

### Navegador

**Nunca preguntar `typeof navigator !== 'undefined'` durante el render.** Es
una rama servidor/cliente: da distinto en cada lado, React lo detecta como un
error de hidratación y tira el árbol entero para volver a generarlo. Se ve en
la consola y **no** en la pantalla, así que puede quedar meses sin que nadie lo
note — estuvo así en `captura-gps.tsx` desde que se escribió.

Lo correcto es `useSyncExternalStore(suscribir, leerDelCliente, leerDelServidor)`.
El mismo patrón sirve para cualquier cosa que exista solo en el navegador:
`sessionStorage`, `MediaRecorder`, permisos. Ver `voice-recorder.tsx` y
`aviso-sin-ubicar.tsx`.

- **`MediaRecorder` no trae la duración en la cabecera.** El reproductor nativo
  muestra minutos u horas para un audio de dos segundos. Por eso hay un
  reproductor propio (`reproductor-audio.tsx`) que usa la duración medida al
  grabar y guardada en la base.
- La duración se mide con **marcas de tiempo**, no contando intervalos: si el
  navegador pausa los timers (pantalla apagada) el conteo se desfasa.
- **iOS Safari no soporta webm**, graba `audio/mp4`. El formato se elige con
  `isTypeSupported`, nunca fijo.
- Siempre `stream.getTracks().forEach(t => t.stop())` al terminar: si no, el
  indicador de micrófono queda encendido y consume batería.
- Para latitud/longitud usar `inputMode="decimal"`, **no** `numeric`: el
  teclado numérico de iOS no trae el signo menos.
- **`setState` sincrónico dentro de un `useEffect`** dispara el error de lint
  `react-hooks/set-state-in-effect`. Dos arreglos según el caso:
  `useSyncExternalStore` (valores que solo existen en cliente) o manejar el
  estado desde los callbacks de los eventos.
- En gestos táctiles, la decisión se toma con una **ref**, no con el estado: con
  un deslizamiento rápido React todavía no re-renderizó y el gesto se pierde.

### Tests

**El indicador de desarrollo de Next está apagado** (`devIndicators: false`).
Flota sobre la esquina inferior izquierda, justo donde viven botones de verdad,
y se lleva el toque: en los tests aparece como «`<nextjs-portal>` intercepts
pointer events», que no se parece en nada a la causa. En producción no existe.

**Nunca reintentar una acción que no sea idempotente.** El helper `elegir`
reintenta el click y lo dice en su comentario; aun así se cayó en la trampa al
escribir un helper que reintentaba *agregar un vértice*, y cada reintento
sumaba un punto de más que deformaba la figura. El síntoma aparecía mucho
después, al tocar el dibujo donde ya no estaba.

**Ninguna aserción sobre el mapa por índice.** El administrador ve los dibujos
y los puntos de TODAS las fincas, incluidas las de las corridas que van en
paralelo: «el primer dibujo» puede ser el de otro worker. Se busca por nombre o
por `data-id`, nunca por posición en la lista. Pasó tres veces antes de quedar
escrito.

**Los dibujos SUELTOS no los alcanza ninguna cascada.** No cuelgan de una
finca, así que borrar la finca de la corrida no se los lleva: hay que borrarlos
por su nombre, que lleva la marca. Sin eso quedaban para siempre — pasó, y el
administrador se encontró treinta referencias de prueba desperdigadas por el
mapa. `scripts/limpiar-pruebas.ts` limpia lo que ya haya quedado.

**Los tests de dibujo empiezan con el mapa limpio** (`borrarDibujos` en un
`beforeEach`). Todos trabajan sobre la misma finca y tocan las mismas
coordenadas de pantalla: con los dibujos acumulándose, un test termina tocando
el de otro y falla por algo que no tiene que ver con lo que estaba probando.

- **El loader de Playwright compila a CommonJS y el cliente de Prisma 7 es ESM
  puro**: no se puede importar Prisma desde un `.spec.ts`. Los fixtures corren
  en proceso aparte (`tests/e2e/fixture-runner.ts`) invocado con `execFileSync`.
- **`page.goto('/api/auth/signout')` NO cierra sesión** (Auth.js exige POST).
  Como el middleware redirige `/login` → `/` con sesión activa, el helper
  "tenía éxito" pero el test seguía corriendo **como el usuario anterior**. El
  `login()` ahora limpia cookies **siempre**.
- **Orden de borrado en el teardown**: primero fincas, después usuarios.
  `Receipt` e `Intervention` referencian `createdById` sin cascade.
- Los esqueletos de carga van **`aria-hidden`**: si no, `getByRole('listitem')`
  cuenta las filas del esqueleto como si fueran datos.
- `Intl.NumberFormat('es-AR')` separa el símbolo con **espacio duro** (U+00A0).
- Los tests **no deben depender del estado que dejó otro test**. Encadenarlos
  hizo fallar 6 de 7 y tardar 4,4 min; con fixtures independientes, 40 s.
- `shadcn` v4 **reemplazó el componente `form` por `field`**; `CardTitle`
  renderiza un `div`, no un heading.

### Supabase plan gratuito

- **Pausa los proyectos tras una semana sin uso.** El primer pedido después
  tarda en despertarlo.
- **Estrangula tras uso intensivo**: durante el desarrollo un `SELECT 1` llegó a
  tardar **31 segundos** después de correr la suite completa muchas veces. No
  era el código.

---

## 10. Pendientes

### Lo que puede hacerse sin el usuario

| Pendiente | Nota |
|---|---|
| **Historial en el respaldo** | Hoy el respaldo lleva fincas, pozos y dibujos. Las intervenciones y mediciones no. |
| **Cola de subida offline** | IndexedDB + Background Sync. Difirido a propósito: si falla en silencio, el operario cree que guardó y no guardó. Es una fase propia. |
| **Limpieza de archivos huérfanos** | Si alguien graba un audio y abandona el formulario, el archivo queda en el bucket sin fila. |

### Lo que necesita acción del usuario

| Pendiente | Qué tiene que hacer |
|---|---|
| **Dominio propio (DonWeb)** | Comprarlo. Después: agregarlo en Vercel y copiar los registros DNS **que muestre el panel** (no los de un tutorial: las IP cambiaron). No hace falta para nada — la URL `.vercel.app` ya tiene HTTPS, que es lo único que exigen cámara y micrófono. |
| **Login con Google** | Crear OAuth client en Google Cloud Console con los redirect URIs, y cargar `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` en Vercel. El código ya está; el botón aparece solo. ⚠️ Antes hay que agregar un filtro para que solo entren emails ya dados de alta. |
| **Transcripción de audio** | Crear cuenta en Groq y cargar `GROQ_API_KEY`. **Requiere IA**: no existe forma de transcribir voz con programación determinista. Groq tiene Whisper large-v3-turbo con plan gratuito generoso. |

### Sobre el mapa

| Pendiente | Nota |
|---|---|
| **Clustering de marcadores** | Solo si crecen mucho las fincas. Ver §11. |
| **Numeración visible fuera del mapa** | Hoy el número del pozo se ve solo en el mapa. En la ficha del pozo y en el listado de la finca todavía no. |
| **Cargar coordenadas de las fincas reales** | El mapa solo muestra lo que alguien marcó con el GPS estando en el lugar. Los datos demo ya vienen ubicados; las fincas reales hay que salir a marcarlas. |
| **Allowed HTTP Origins en MapTiler** | Cuando esté el dominio. Ver DEPLOY.md — sin eso la clave sirve desde cualquier sitio. |

### ⚠️ Separar Supabase dev/prod — el paso que falta

Los pasos exactos están en DEPLOY.md. En resumen: se crea una base NUEVA para
desarrollo y la actual queda como producción —al revés habría que cambiar
variables en Vercel y migrar datos, sin ninguna ventaja—. Vercel no se toca.

`npm run db:donde` imprime a qué proyecto apunta el `.env` sin mostrar
contraseñas. Vale mirarlo antes de correr los tests: es la diferencia entre
borrar datos de prueba y borrar los del cliente.

#### Por qué urge

**Hoy producción y desarrollo comparten el mismo proyecto de Supabase.** Eso
significa que los tests e2e escriben y borran en la misma base que usa la app
publicada, y que compiten por la misma cuota del plan gratuito.

No importó mientras no hubiera datos reales. **Antes de que la empresa cargue
la primera finca de verdad, hay que separarlo.** El usuario tiene que crear un
segundo proyecto Supabase (con los buckets privados `remitos` y `notas-voz`) y
cargar sus variables en Vercel.

Cuando estén separados, **ahí sí** conviene mover `prisma migrate deploy` al
build de producción. Hoy está fuera a propósito: con una sola base, cada deploy
de preview migraría los datos reales.

---

## 11. Cómo trabajar en el proyecto

```bash
npm run dev          # servidor de desarrollo
npm run build        # prisma generate && next build
npm run typecheck
npm run lint
npm run test         # vitest (unitarios)
npm run db:migrate   # migraciones en desarrollo
npm run db:deploy    # aplicar migraciones (se corre A MANO, no en el build)
npm run db:seed      # 13 servicios base + admin
npm run db:demo      # datos de demostración (DESTRUCTIVO)
npm run db:studio    # inspeccionar la base
npm run iconos       # regenerar íconos PWA

npx playwright test --project=mobile              # e2e
E2E_BASE_URL=https://… npx playwright test        # contra producción
```

### Antes de dar algo por terminado

```bash
npx tsc --noEmit; echo "TSC=$?"
npx eslint .;     echo "LINT=$?"
npx vitest run;   echo "UNIT=$?"
mv .env .env.bak && npx next build; echo "BUILD=$?"; mv .env.bak .env
npx playwright test --project=mobile --workers=2
```

⚠️ **Verificar el código de salida, no la salida de texto.** `npx eslint . |
tail` devuelve el código de `tail`, no de eslint — eso enmascaró un error real
durante el desarrollo.

⚠️ **Los e2e escriben en la base real.** Crean y borran registros con prefijo
`e2e-`. Mientras dev y prod compartan proyecto, no correrlos contra producción
si hay datos reales.

### Preferencias del usuario (Tomás)

- Habla y escribe en **español rioplatense**; el código y los comentarios
  también van en español.
- **Puede pushear sin preguntar** — lo autorizó explícitamente.
- Quiere que la app funcione **íntegramente para el cliente**: no dejar cosas a
  medias. La única excepción aceptada son los límites de los planes gratuitos.
- Le importa mucho el **feedback visual**: toda acción que tarde debe mostrar
  algo (ver `loading.tsx`, `useLinkStatus`, esqueletos).
- Prefiere que se le expliquen las **decisiones y sus motivos**, no solo el
  resultado.

---

## 12. Historial de sesiones

| Etapa | Qué se hizo |
|---|---|
| Fase 0 | Scaffolding: Next 16, Prisma 7, shadcn, Vitest, Playwright |
| Fase 1 | Auth.js v5, núcleo de autorización puro, guards |
| Fase 2 | CRUD de fincas, pozos y usuarios |
| Fase 3 | Catálogos extensibles con deduplicación por slug |
| Fase 4 | **Corazón**: intervención en un submit, timeline, gráficos |
| Fase 5 | Notas de voz + toda la infraestructura de Storage privado |
| Fase 6 | Remitos con cámara, compresión y galería |
| Fase 7 | Auditoría IDOR sistemática + portal del cliente |
| Fase 8 | PWA con service worker propio (no plugin) |
| Fase 9 | Deploy en Vercel |
| Extra | Identidad visual ARENAS + renombre a InfoWell |
| Extra | Diagnóstico de configuración, mensajes de error con causa |
| Extra | Varias notas de voz, visor con gestos, detalle de remito |
| Extra | Estados de carga en toda la app, límites de conexión |
| Extra | Editar y eliminar intervenciones |
| Extra | Datos de demostración |

### Documentos relacionados

- **`DEPLOY.md`** — variables de entorno, migraciones, dominio DonWeb, Google
  OAuth, cómo verificar un deploy.
- **`AGENTS.md` / `CLAUDE.md`** — advertencia de Next.js sobre leer la
  documentación de la versión instalada.

---

## 11. El mapa

Es la última incorporación y la más visible. Vive en `/mapa`, se entra por un
botón ancho en el inicio.

### Por qué MapLibre y no Cesium

El usuario venía inclinado a CesiumJS por el parecido con Google Earth. Se
descartó por tres razones, en orden de peso:

1. **Peso en el celular.** Cesium son 3-5 MB comprimidos y un globo WebGL con
   tiles de terreno en memoria. Esta app la abre un técnico en una finca, con
   3G y un Android de gama media. Es el peor escenario para Cesium.
2. **Encarece lo que de verdad cuesta.** Lo caro del feature no es la imagen
   satelital: es el picking de puntos, la ficha arrastrable y editar desde ahí.
   En MapLibre eso es camino trillado.
3. **Su ventaja no aplica.** Cesium brilla con elevación y volumen. Acá la
   profundidad es *bajo* tierra, y eso ya lo resuelve mejor el perfil de pozo
   en SVG (§7).

MapLibre y no Mapbox GL JS porque Mapbox v2+ es licencia propietaria y factura
por *map loads*: una PWA que el operario abre treinta veces por día quema ese
contador. MapLibre es el fork abierto y solo se autentican los *tiles*, lo que
además desacopla la librería del proveedor de imagen.

### La imagen

MapTiler, estilo `hybrid` (satélite + nombres de ruta y paraje, que es lo único
que permite ubicarse en el campo). Se verificó sobre las coordenadas reales de
los datos demo antes de construir: **es nítida hasta z17-18 sobre Mendoza y de
ahí en adelante interpola**. Esri World Imagery tiene un nivel más de detalle
real, pero no cambia nada operativo — el GPS del teléfono tiene ±8-10 m de
error, así que el sub-métrico no aporta.

Cambiar de proveedor es una sola variable de entorno y el `style` del mapa.

### Decisiones que no conviene revertir

- **Los pozos se ocultan por debajo de z13** (`ZOOM_POZOS` en `mapa.tsx`). Un
  pozo está a decenas de metros del casco: de lejos los pines se pisan y
  ninguno se puede tocar. De lejos se ven las fincas, al acercarse los pozos.
- **La ficha reencuadra el mapa con `padding`.** Ocupa el 70% de abajo; sin
  reencuadrar, el punto que se acaba de tocar queda detrás de ella.
- **El contenedor del mapa lleva `pointer-events-auto`.** vaul se apoya en
  Radix, que pone `pointer-events: none` en el `body` mientras la ficha está
  abierta *aunque sea no-modal*. Sin esa línea no se puede tocar otro marcador
  ni mover el mapa, y no hay ningún error que lo delate.
- **La ficha no usa el `Drawer` de shadcn** sino vaul directo: ese preset es
  modal y tapa el mapa con un velo, que es exactamente lo contrario de lo que
  se busca.
- **Nada de `snapPoints`.** Con topes intermedios vaul abría la ficha apenas
  asomando por el borde. Altura fija de 70vh, scroll adentro, arrastre para
  cerrar — que es además lo que se había pedido.
- **El mapa no espera el evento `load`.** No llega a dispararse cuando React
  vuelve a montar el componente (StrictMode lo hace siempre en desarrollo), y
  esperarlo dejaba el mapa sin marcadores. Los marcadores son elementos del DOM
  que el mapa posiciona, no capas del estilo: se pueden colgar apenas el mapa
  existe. El mapa vive en `useState`, no en un `ref`, para que los efectos que
  le cuelgan cosas vuelvan a correr cuando se recrea.

### Crear un pozo desde el mapa

Desde la ficha de una finca, «Agregar un pozo acá» entra en **modo colocación**:
la mira queda fija en el centro y el usuario mueve el mapa por debajo. Es al
revés de tocar el punto con el dedo, y es a propósito — el dedo tapa justo lo
que hay que mirar, y en un cabezal de pozo de un metro eso es la diferencia
entre marcarlo bien y marcar el tinglado de al lado.

Al confirmar, las coordenadas viajan en la URL (`?lat=&lon=`) y el formulario
abre con la ubicación puesta, diciendo «Marcada en el mapa». Se redondean a 7
decimales, que es lo que guarda la columna: mandar los 15 dígitos de un float
sería fingir una precisión que no existe ni en el GPS ni en la base.

La URL la escribe cualquiera, así que la página valida: si no es un número
dentro de rango se descarta en silencio y el formulario abre vacío. No muestra
un error porque el usuario no escribió eso.

El alta vuelve al mapa y no a la finca. El destino se pasa a la server action
como **booleano**, nunca como ruta: el valor va y vuelve por el cliente, y
aceptar una URL de ahí sería un redirect abierto.

### `?punto=<id>` y el problema de los pines encimados

A zoom amplio, dos fincas cercanas dibujan pines que se pisan y el de atrás no
hay forma de tocarlo. La salida es acercarse — y para llegar directo está
`/mapa?punto=<id>`, que abre el mapa ya encuadrado sobre esa finca o ese pozo.
Es la entrada de «Ver en el mapa» desde la ficha de la finca y desde la tarjeta
de coordenadas del pozo.

El id no se valida contra nada: se busca dentro de los marcadores que el actor
**ya** puede ver, así que un id ajeno simplemente no aparece.

Cuando se entra por ahí, **no** se dispara la ubicación del usuario: pidió ese
pozo, no dónde está parado. Además el seguimiento de ubicación recentra solo y
le peleaba al encuadre, dejando los pines moviéndose sin parar.

Si algún día hay tantas fincas que ni acercándose alcanza, lo que corresponde
es *clustering*, y eso implica pasar los marcadores de elementos del DOM a una
fuente GeoJSON con capas de símbolos. No se hizo ahora porque a esta escala el
costo no se justifica.

### La ficha y sus dos alturas — y la trampa de vaul

La ficha abre al **34%** de pantalla (nombre y primeras filas de datos) y se
sube al **60%** arrastrando el borde. Nunca pasa de ahí: el mapa conserva su
franja de arriba. El encuadre acompaña el tope activo, así que el punto que se
está mirando no queda tapado en ninguna de las dos alturas.

⚠️ **El alto del contenido no es libre.** vaul mueve la ficha con
`translate3d(0, ventana − tope × ventana)`, cuenta que asume que el elemento
arranca pegado al borde de arriba. Si se le da un alto parcial y se lo ancla
abajo —lo natural para un panel inferior—, ese desplazamiento se SUMA al que ya
trae y la ficha aparece **asomando apenas por el borde**, sin ningún error.
Por eso el contenedor va a pantalla completa y quien define lo que se ve es el
bloque de adentro, con el alto del tope mayor.

Esto costó un rato la primera vez y llevó a sacar los topes por completo. La
respuesta estaba en `node_modules/vaul/dist/index.mjs`, no en la documentación.

### El mapa recuerda dónde quedó

La primera vez arranca en la ubicación del usuario. Pero yendo y viniendo entre
el mapa y los formularios, volver a pedir el GPS y saltar cada vez es
desorientador: el usuario venía mirando una finca y de golpe está en otra parte.
La vista (centro, zoom, inclinación, rumbo) se guarda en **sessionStorage** y se
retoma al volver.

En sessionStorage y no en localStorage a propósito: si cierra la app y la abre
al otro día, en otra finca, arrancar donde está parado vuelve a ser lo correcto.

Lo guardado se valida antes de usarse — puede estar corrupto o venir de una
versión anterior, y un `NaN` en el centro rompe el mapa.

### Elegir el punto en el mapa desde el formulario

El GPS sirve estando parado sobre el pozo. Desde la oficina, o cuando el pozo
está a doscientos metros del auto, marcar sobre la imagen es la única forma
razonable. El botón **«Elegir en el mapa»** está tanto en el alta como en la
edición —al editar es cuando más se necesita, para corregir uno mal ubicado— y
se lleva lo que el usuario ya escribió, devolviéndolo intacto. Sin eso, ir al
mapa desde un formulario a medio llenar lo borraría y nadie usaría el botón una
segunda vez.

### Cada punto se identifica solo

Las fincas llevan **dos letras** de su nombre y los pozos su **número** dentro
de la finca. Sin rótulo, diez pines idénticos sobre una imagen satelital
obligan a tocarlos de a uno para saber cuál es cuál.

Las iniciales saltean conectores («de», «la», «san», «srl»), así «Finca de los
Andes» da FA y no FD. Con una sola palabra usa sus dos primeras letras. Las
tildes se quitan: el rótulo tiene que entrar en el pin.

Los pozos se numeran **por finca** —cada una empieza de nuevo en 1— y se
numeran TODOS, incluidos los que no tienen ubicación. Numerando solo los del
mapa, el «2» del mapa podría ser el tercero de la finca y el número dejaría de
coincidir con la realidad.

El rótulo se pinta con `textContent`, nunca con `innerHTML`: el nombre de la
finca lo escribe un usuario y termina adentro de ese elemento.

### Ajustes de la aplicación

Tabla `AppSetting` en clave/valor, y no variables de entorno: los cambia el
administrador desde la app, no quien deploya. Una variable exigiría redeployar
para algo que es una preferencia de uso.

Vive en `/admin/configuracion`, a la que se llega por el **engranaje** que está
al lado de las pestañas de catálogos, fuera del recuadro. Como tercera pestaña
no entraba en una pantalla de teléfono: se salía del recuadro y dejaba todo el
sitio deslizable a lo ancho, con contenido escondido. Un desborde horizontal no
avisa —no hay error ni nada visiblemente roto—, así que hay un test que lo mide
a 320, 360 y 412 px.

El primero es el **criterio de numeración de los pozos**:
por orden de carga —el que siempre tiene dato— o por fecha de perforación real,
donde los pozos sin fecha van al final para no correr la numeración de los que
sí la tienen.

⚠️ **Un ajuste global no se puede testear en paralelo.** Es UNA fila para toda
la app: dos tests tocándola a la vez se pisan y el segundo lee lo que escribió
el primero. Los tests que lo escriben corren en serie y en un solo proyecto, y
el reset va en `afterAll` —fuera del test— para que corra aunque el test se
caiga a la mitad. Esta base es la misma que usa la app publicada: un ajuste que
quede cambiado se lo queda cambiado la empresa.

### Dibujos sobre el mapa

El mapa base no alcanza: el callejón de tierra que lleva a la finca no figura
en ningún lado y el límite con el vecino no está marcado en el terreno. Eso lo
sabe quien fue, y solo sirve si lo puede dejar anotado.

Cuatro herramientas, desde la ficha de la finca: **Referencia** (un punto),
**Línea**, **Rectángulo** (dos toques, la finca a grandes rasgos) y
**Perímetro** (el contorno real, punto por punto). El rectángulo no es una
forma propia —se guarda como perímetro—, pero sí una herramienta propia: es la
diferencia entre marcar una finca en cinco segundos y no marcarla nunca.

Se dibuja tocando el mapa; el nombre se pide DESPUÉS, no antes, porque quien
está mirando el terreno todavía no sabe qué va a marcar. Los polígonos se
pueden pintar para reconocerlos de lejos, y todos los dibujos se apagan de una
cuando estorban.

Cuelgan de una finca y no del mapa en general: es lo que los mete dentro del
mismo cerco de autorización que todo lo demás. El CLIENTE los ve pero no puede
hacer ninguno.

⚠️ **maplibre-gl v6 necesita que le digan dónde está su worker.** Lo crea como
módulo con una URL relativa a su propio archivo, y esa URL no sobrevive al
empaquetado. Sin worker, el mapa se ve perfecto y NADA vectorial funciona: ni
un relleno, ni una línea, ni un rótulo, ni una tesela vectorial, ni una
tipografía. El raster no pasa por el worker, así que la imagen satelital se
dibuja igual y parece que está todo bien. No hay error, no hay aviso: las capas
existen, tienen datos, están arriba de todo y visibles, y no se ve nada.

`scripts/preparar-worker-mapa.mjs` lo copia del paquete instalado a `public/`
en el build y en postinstall. Van los DOS archivos —el worker importa a su
hermano por ruta relativa—, con sus nombres originales.

Esto explica además dos rarezas que se habían esquivado sin llegar a la causa:
el evento `load` que nunca llegaba y `isStyleLoaded()` que nunca daba
verdadero. Los dos eran el mismo síntoma.

El estilo se arma en el código en vez de pedirle el suyo a MapTiler: los suyos
traen una fuente vectorial que, sin worker, quedaba a medio cargar. Se pierden
los rótulos de calles del mapa base —en el campo casi no existen—; los que sí
importan son los que carga el usuario.

Otras dos que costaron:

- **Mientras se dibuja, un marcador es un lugar más del mapa.** El toque pasa
  de largo y suma un vértice. Si abriera su ficha, no se podría dibujar encima
  de un pozo, que es justo donde uno quiere marcar el perímetro o la entrada.
- **vaul deja la app oculta para los lectores de pantalla.** Se apoya en Radix,
  que marca el resto de la página con `aria-hidden` mientras hay una ficha
  abierta —razonable para un diálogo modal, pero estas no lo son— y no siempre
  lo limpia al cerrar. La app entera desaparecía para quien usa lector de
  pantalla sin que se notara mirando la pantalla. Se vigila con un
  MutationObserver mientras no hay ninguna ficha abierta.

### Lo que falta ubicar

El mapa avisa qué todavía no está en él, con **nombre y enlace al formulario
donde se arregla**. Antes era una franja fija que decía «faltan ubicar 2
registros» y nada más: el usuario se enteraba del problema pero no de cuál era
ni de cómo resolverlo, no podía cerrarla, y tapaba los botones de dibujo. Un
aviso que no se puede accionar es ruido.

Se calla mientras se coloca un punto o se dibuja —los dos momentos en que
estorbaría— y se puede cerrar para toda la visita.

⚠️ **No hay «desactivar» una finca.** La única acción parecida
(`archivarFincaAction`) pone `deletedAt`: es un borrado suave, y saca del mapa
la finca con sus pozos y sus dibujos. Además no está conectada a ninguna
pantalla. Si alguna vez hace falta una finca «apagada pero visible», es otra
cosa y hay que construirla aparte — hay un test que fija el comportamiento
actual para que el cambio sea deliberado.

### No hay herramienta «Rectángulo»

La hubo: dos toques y quedaba la finca marcada a grandes rasgos. Se sacó porque
el perímetro hace lo mismo con cuatro toques y un «Listo», y sostener un
segundo modo de dibujo —con su bandera propia atravesando el mapa, la ficha y
el guardado— costaba más de lo que ahorraba. Tenía además un defecto de dibujo
sin diagnosticar; sacarla lo cerró de raíz.

### Tocar un dibujo

Se toca en el mapa y se abre para corregirlo o borrarlo. La detección usa
`queryRenderedFeatures` en un cuadradito de 8 px alrededor del dedo, y hay una
**capa de contacto invisible de 22 px** por debajo de la línea visible: la
línea mide 3 px y un perímetro sin pintar solo se puede tocar en su borde —
nadie le acierta a 3 px con el pulgar.

La ficha de la finca además **lista sus dibujos**: encontrarlos recorriendo el
mapa a ojo no es forma, y desde la lista se abre cualquiera aunque esté fuera
del encuadre actual.

El panel lleva `key={id}`: sus campos se inicializan al montar, así que sin eso
tocar otro dibujo con el panel abierto mostraba —y guardaba— el nombre del
anterior.

### Correr los puntos de un dibujo

Desde el panel de un dibujo ya hecho, «Mover los puntos» cierra el panel y
deja el mapa entero con una **agarradera por vértice**. Se arrastran, la forma
sigue al dedo, y Guardar o Cancelar cierran el modo. Cancelar devuelve el
dibujo a donde estaba: lo que se arrastra es una copia en memoria, y a la base
no llega nada hasta guardar.

Las agarraderas son **marcadores arrastrables de MapLibre**: la misma
maquinaria que los pines, que ya sabe seguir el dedo y convertir a coordenadas.
Miden 24-28 px, bastante más que el vértice que se ve mientras se dibuja —
acá hay que agarrarlas, no solo verlas.

⚠️ **El efecto que las crea NO depende de las posiciones**, solo de cuántas hay
y de qué dibujo. Si dependiera de las coordenadas, cada cuadro del arrastre
recrearía el marcador y este desaparecería debajo del dedo a mitad del gesto.
Las posiciones entran por un ref.

Mientras se corren los puntos, el mapa deja de escuchar toques y los
marcadores no abren su ficha: cada toque sería abrir otra cosa en medio del
arrastre. Comparte la capa de borrador con el modo de dibujo, así que los dos
nunca pueden estar activos a la vez.

### De qué cuelga un dibujo

Tres casos, y la diferencia entre ellos es de **permisos**, no de dibujo:

| Cuelga de | Ejemplo | Quién lo ve |
|---|---|---|
| Una **finca** | Su perímetro, el límite con el vecino | Quien ve esa finca |
| Un **pozo** | Cómo se llega al cabezal en una finca grande | Quien ve esa finca |
| **Nada** | Una referencia en la ruta, un cruce | ADMIN y CARGADOR |

Un dibujo de pozo lleva también el `farmId`: de ahí sale su alcance.

⚠️ **Los sueltos son internos.** Al no colgar de ninguna finca quedan fuera de
la cadena que garantiza el aislamiento, y sus nombres podrían delatarle a un
cliente dónde están las fincas de otros. Por eso tienen recurso propio en
`authz.ts` (`'annotation'`), fuera de `FARM_SCOPED`, y el CLIENTE no los recibe
**ni para leer** — es la única excepción a «cualquier autenticado lee».

El CARGADOR sí puede marcarlos: es el que anda por la ruta y sabe por dónde se
entra.

### Respaldo de los datos

`/admin/configuracion` baja un JSON con **fincas, pozos y todo lo dibujado**, y
lo vuelve a cargar. Sirve para guardarse una copia y para mudar los datos a
otra instalación —por ejemplo al separar la base de pruebas de la del cliente.

⚠️ **No es una copia completa, y la pantalla lo dice.** Quedan afuera los
remitos y las notas de voz —sus fotos y audios viven en el almacenamiento de
archivos y no entran en un archivo de texto; restaurar solo la fila dejaría
remitos apuntando a fotos que no existen—, el historial de intervenciones y
los usuarios. Un respaldo que promete más de lo que guarda es peor que no
tener ninguno: el día que haga falta, ya es tarde para enterarse.

Importar es un **upsert por id**, no un borrado y alta: importar dos veces deja
lo mismo que importar una, y volver a cargar una copia vieja corrige lo que
estaba en ella sin borrar lo que se agregó después. Un import que borrara
primero convertiría cada equivocación en pérdida de datos.

La geometría de cada dibujo se valida con las mismas reglas que al dibujarlo
—el archivo lo pudo tocar cualquiera— y los que quedarían huérfanos se omiten
y se cuentan, en vez de hacer fallar la importación entera.

⚠️ **Los tests que IMPORTAN usan un archivo acotado a su propia finca.** Un
import completo reescribe todas las fincas y revierte lo que otro test acababa
de cambiar: tumbó un test de dibujos que no tenía nada que ver. Exportar, que
es de solo lectura, sí se prueba entero.

### Seguridad

`puntosDelMapa()` sale del mismo `scopeDeFincas()` que el resto (§6). Es la
vista **más agregada de toda la app**: una sola ruta que junta todas las fincas
del actor, y las coordenadas viajan enteras al navegador. Filtrar en la vista
no alcanzaría. La auditoría verifica que el id de una finca ajena no aparezca
en el HTML que recibe el cliente, no solo que no se dibuje.
