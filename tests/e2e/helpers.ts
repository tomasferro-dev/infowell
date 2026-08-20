import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Los fixtures se crean con Prisma en un proceso aparte (ver fixture-runner.ts):
 * el loader de Playwright compila a CommonJS y el cliente de Prisma 7 es ESM
 * puro, así que no conviven en el mismo proceso.
 */

const RUNNER = path.join(__dirname, 'fixture-runner.ts')

export const CLAVE_TEST = 'clave-de-prueba-123'

/** Sufijo único por corrida, para no chocar con datos de corridas previas. */
export const marca = `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`

export type DatosTest = {
  fincaPropiaId: string
  pozoPropioId: string
  fincaAjenaId: string
  pozoAjenoId: string
}

function correrRunner(
  comando: 'setup' | 'teardown' | 'teardown-catalogo' | 'notas-de-voz',
  marcaCorrida: string,
) {
  const salida = execFileSync('npx', ['tsx', RUNNER, comando, marcaCorrida], {
    encoding: 'utf8',
    shell: true,
    cwd: path.join(__dirname, '..', '..'),
  })

  // El runner puede imprimir warnings antes del JSON: se toma la última línea.
  const lineas = salida.trim().split('\n')
  return JSON.parse(lineas[lineas.length - 1]!)
}

export function montarDatos(marcaCorrida: string): DatosTest {
  return correrRunner('setup', marcaCorrida)
}

export function limpiarDatos(marcaCorrida: string) {
  correrRunner('teardown', marcaCorrida)
}

/** Siembra una intervención con dos notas de voz de duraciones distintas. */
export function sembrarNotasDeVoz(marcaCorrida: string): { wellId: string; farmId: string } {
  return correrRunner('notas-de-voz', marcaCorrida)
}

/** Borra los items de catálogo creados por los tests que nadie referencia. */
export function limpiarCatalogo(marcaCorrida: string) {
  correrRunner('teardown-catalogo', marcaCorrida)
}

/**
 * Escribe en un campo y verifica que el valor haya quedado.
 *
 * Playwright puede escribir ANTES de que React hidrate la página, y en ese
 * caso la hidratación pisa el valor y el campo queda vacío — sin error, sin
 * aviso, y el test falla después por algo que parece no tener relación.
 * Con loading.tsx la ventana es más ancha todavía.
 *
 * Escribir y confirmar, reintentando, elimina esa clase entera de
 * intermitencia.
 */
export async function escribir(locator: Locator, texto: string) {
  await expect(async () => {
    await locator.fill(texto)
    await expect(locator).toHaveValue(texto, { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Inicia sesión como `email`.
 *
 * Limpia las cookies primero, SIEMPRE. Sin eso, si ya había una sesión abierta
 * el middleware redirige /login a / y el test seguiría corriendo como el
 * usuario anterior sin avisar — verificando permisos del rol equivocado.
 * (Navegar a /api/auth/signout por GET no cierra la sesión: Auth.js exige POST.)
 */
export async function login(page: Page, email: string, password = CLAVE_TEST) {
  await page.context().clearCookies()

  await page.goto('/login')
  await escribir(page.getByLabel('Email'), email)
  await escribir(page.getByLabel('Contraseña'), password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL('/')
}
