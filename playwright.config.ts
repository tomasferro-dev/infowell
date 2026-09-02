// Los tests usan las credenciales del seed desde el entorno, nunca escritas
// en el código: hay que cargar el .env antes de leerlas.
//
// Y leen la base de DESARROLLO, nunca la de producción: cargarEntorno pone
// .env.test encima del .env, y exigirBaseDeDesarrollo corta si no está o si
// apunta al mismo proyecto. Ver scripts/entorno.ts.
import { defineConfig, devices } from '@playwright/test'

import { cargarEntorno, exigirBaseDeDesarrollo } from './scripts/entorno'

cargarEntorno()
exigirBaseDeDesarrollo()

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * Los flujos e2e se ejercitan en viewport móvil: la app es mobile-first y los
 * dos roles que más la usan (Cargador y Cliente) entran desde el celular.
 * El proyecto de escritorio cubre el panel de administración.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Se limitan los workers a propósito.
   *
   * Playwright usaría la mitad de los núcleos (8 acá), y los 8 pegándole a la
   * misma base gratuita de Supabase la estrangulan: los tests no fallan por
   * una aserción sino por timeout, y falla uno distinto en cada corrida. En
   * serie los mismos tests tardan 10-15 s cada uno; con 8 workers se pasan de
   * los 30 s. Con 4 el banco respira y sigue siendo 4x más rápido que en serie.
   */
  workers: process.env.CI ? 2 : 4,
  /**
   * 60 s por test en vez de los 30 s por defecto.
   *
   * Un test de este banco hace login + alta completa + edición contra la base
   * real: 10-15 s sin competencia. Con 30 s el margen es de apenas 2x y
   * cualquier lentitud del plan gratuito lo tumba.
   */
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  /**
   * 10 s en vez de los 5 s por defecto.
   *
   * Los tests corren contra el servidor de desarrollo y contra la base real de
   * Supabase; con varios workers en paralelo, un submit que abre una
   * transacción de varias sentencias supera holgadamente los 5 s. No es
   * lentitud de la app en producción: es el banco de pruebas.
   */
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Contra la URL de producción (E2E_BASE_URL) no se levanta servidor local.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
