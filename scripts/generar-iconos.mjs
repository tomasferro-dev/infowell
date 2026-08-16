import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

/**
 * Genera los íconos de la PWA a partir de un SVG.
 *
 * Se versionan los PNG resultantes, así el build no depende de sharp. Para
 * regenerarlos: npm run iconos
 */

const SALIDA = path.join(process.cwd(), 'public', 'icons')

/**
 * Ícono de la app: la gota sobre el carbón del logo, cortada por la regla roja.
 *
 * Es el mismo gesto de la marca reducido a su mínima expresión: el rojo
 * atraviesa, no rellena. A 48px —que es como se ve en la grilla del teléfono—
 * lo que se distingue es justamente el corte rojo.
 */
function svgIcono({ conFondo, escala }) {
  const s = escala

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${conFondo ? 0 : 96}" fill="#383a3c"/>
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M256 92 C256 92 138 234 138 312 a118 118 0 0 0 236 0 C374 234 256 92 256 92 Z"
          fill="#ffffff"/>
    <rect x="96" y="300" width="320" height="26" fill="#ec1f25"/>
  </g>
</svg>`
}

const ICONOS = [
  { archivo: 'icon-192.png', tamano: 192, conFondo: false, escala: 1 },
  { archivo: 'icon-512.png', tamano: 512, conFondo: false, escala: 1 },
  // El maskable lleva fondo a sangre y el dibujo al 72%, dentro de la zona segura.
  { archivo: 'icon-maskable-512.png', tamano: 512, conFondo: true, escala: 0.72 },
  { archivo: 'apple-touch-icon.png', tamano: 180, conFondo: true, escala: 0.86 },
]

await mkdir(SALIDA, { recursive: true })

for (const { archivo, tamano, conFondo, escala } of ICONOS) {
  const svg = Buffer.from(svgIcono({ conFondo, escala }))
  const png = await sharp(svg).resize(tamano, tamano).png().toBuffer()

  await writeFile(path.join(SALIDA, archivo), png)
  console.log(`✓ ${archivo} (${tamano}px)`)
}

// El favicon del navegador usa el mismo dibujo, en SVG para que escale solo.
await writeFile(path.join(SALIDA, 'icon.svg'), svgIcono({ conFondo: false, escala: 1 }))
console.log('✓ icon.svg')
