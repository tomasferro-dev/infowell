import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * El indicador de desarrollo de Next queda flotando sobre la esquina
   * inferior izquierda de la app.
   *
   * Se apaga porque ahí abajo viven botones de verdad —el de borrar un dibujo,
   * entre otros— y el indicador se lleva el toque: en los tests aparece como
   * «<nextjs-portal> intercepts pointer events», que no se parece en nada a la
   * causa. En producción no existe, así que apagarlo no cambia lo que ve el
   * cliente: solo deja de mentirle a quien prueba la app.
   */
  devIndicators: false,
}

export default nextConfig
