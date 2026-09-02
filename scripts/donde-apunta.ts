import { ARCHIVO_DEV, proyectoDelArchivo } from './entorno'

/**
 * A qué base habla cada cosa.
 *
 * Existe porque hay dos —la del cliente y la de desarrollo— y desde la
 * terminal se ven idénticas.
 */

const produccion = proyectoDelArchivo('.env')
const desarrollo = proyectoDelArchivo(ARCHIVO_DEV)

console.log('\n  .env           (npm run dev, Vercel) → ' + (produccion ?? '✗ no se pudo leer'))
console.log(`  ${ARCHIVO_DEV}      (tests, db:*:dev)     → ` + (desarrollo ?? '✗ no existe'))

if (!desarrollo) {
  console.log('\n  ⚠️  Sin ' + ARCHIVO_DEV + ' los tests NO corren: cortan antes de tocar nada.')
  console.log('     Ver DEPLOY.md para armarlo.\n')
} else if (desarrollo === produccion) {
  console.log('\n  ⚠️  Son el MISMO proyecto. Los tests van a cortar: crean y borran datos.\n')
} else {
  console.log('\n  ✓ Separadas. Los tests no tocan la base del cliente.\n')
}
