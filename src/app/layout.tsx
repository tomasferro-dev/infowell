import type { Metadata, Viewport } from 'next'
import { Archivo, Geist_Mono } from 'next/font/google'

import { IndicadorDeConexion, RegistrarServiceWorker } from '@/components/layout/pwa'
import { Toaster } from '@/components/ui/sonner'

import './globals.css'

/**
 * Archivo, de Omnibus-Type (Buenos Aires).
 *
 * Se eligió por dos razones concretas: es una grotesca de eje variable que
 * llega a los pesos altos y algo condensados del lettering del logo, y es una
 * fundición argentina — la misma procedencia que la empresa.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  // El rango completo: 400 para leer, 600-700 para títulos y botones.
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'InfoWell',
    template: '%s · InfoWell',
  },
  description: 'Historial técnico de perforaciones — ARENAS Perforaciones',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    // iOS no lee el manifest: la configuración de app instalada va por acá.
    capable: true,
    title: 'InfoWell',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // La app es privada: no tiene sentido que la indexe un buscador.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  // Evita el zoom automático de iOS al enfocar un input, sin bloquear el
  // pinch-to-zoom del usuario (que sí sería un problema de accesibilidad).
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#383a3c',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <IndicadorDeConexion />
        {children}
        <Toaster position="top-center" richColors />
        <RegistrarServiceWorker />
      </body>
    </html>
  )
}
