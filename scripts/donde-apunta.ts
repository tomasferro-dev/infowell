import 'dotenv/config'

/**
 * A qué base apunta el `.env` de esta máquina.
 *
 * Existe porque hay dos —la de desarrollo y la que usa el cliente— y desde la
 * terminal se ven idénticas. Correr los tests contra la equivocada borra datos
 * reales, y no hay forma de darse cuenta hasta que ya pasó.
 *
 * No imprime contraseñas: solo el proyecto, el host y el puerto.
 */

function describir(nombre: string) {
  const valor = process.env[nombre]
  if (!valor) return `${nombre.padEnd(26)} ✗ falta`

  try {
    const url = new URL(valor)
    // El usuario del pooler de Supabase es «postgres.<proyecto>».
    const proyecto = url.username.includes('.') ? url.username.split('.')[1] : '(directo)'
    return `${nombre.padEnd(26)} ${proyecto}  ·  ${url.hostname}:${url.port || '5432'}`
  } catch {
    return `${nombre.padEnd(26)} ✗ no parsea como URL`
  }
}

console.log('\nA qué base apunta este .env:\n')
console.log(' ', describir('DATABASE_URL'))
console.log(' ', describir('DIRECT_URL'))

const storage = process.env.NEXT_PUBLIC_SUPABASE_URL
console.log(' ', 'NEXT_PUBLIC_SUPABASE_URL'.padEnd(26) + ' ' + (storage ?? '✗ falta'))

console.log('\n⚠️  Los tests CREAN Y BORRAN datos en esta base.')
console.log('   Si es la que usa el cliente, no los corras.\n')
