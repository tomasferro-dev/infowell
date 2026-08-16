'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Visor de imágenes a pantalla completa.
 *
 * Dos comportamientos que en el celular no son opcionales:
 *
 * 1. BLOQUEA EL SCROLL DE ATRÁS. Sin eso, el dedo mueve la página que está
 *    debajo y al cerrar el visor aparecés en otro lado de la pantalla.
 * 2. SE CIERRA DESLIZANDO HACIA ABAJO. Es el gesto que todo el mundo ya tiene
 *    aprendido de la galería del teléfono; buscar la X con una mano y guantes
 *    es incómodo.
 */

export type ImagenVisor = { id: string; src: string; alt: string }

/** Distancia en píxeles a partir de la cual soltar el dedo cierra el visor. */
const UMBRAL_CIERRE = 110

export function VisorImagenes({
  imagenes,
  indiceInicial,
  onCerrar,
}: {
  imagenes: ImagenVisor[]
  indiceInicial: number
  onCerrar: () => void
}) {
  const [indice, setIndice] = useState(indiceInicial)
  /** Desplazamiento vertical del arrastre, para dibujar. */
  const [desplazamiento, setDesplazamiento] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicioY = useRef<number | null>(null)
  /**
   * El mismo desplazamiento, en una ref.
   *
   * La decisión de cerrar se toma con ESTE valor y no con el estado: si el
   * dedo se mueve y se levanta antes de que React vuelva a renderizar, el
   * estado todavía tiene el valor anterior y el gesto se perdería.
   */
  const desplazamientoRef = useRef(0)

  const actual = imagenes[indice]
  const hayVarias = imagenes.length > 1

  const anterior = useCallback(
    () => setIndice((i) => (i - 1 + imagenes.length) % imagenes.length),
    [imagenes.length],
  )
  const siguiente = useCallback(
    () => setIndice((i) => (i + 1) % imagenes.length),
    [imagenes.length],
  )

  // Bloquea el scroll del documento mientras el visor está abierto, y lo
  // restaura exactamente como estaba al cerrarlo.
  useEffect(() => {
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflowPrevio
    }
  }, [])

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'ArrowRight' && hayVarias) siguiente()
      if (e.key === 'ArrowLeft' && hayVarias) anterior()
    }

    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [onCerrar, siguiente, anterior, hayVarias])

  function alTocar(e: React.TouchEvent) {
    inicioY.current = e.touches[0]?.clientY ?? null
    desplazamientoRef.current = 0
    setArrastrando(true)
  }

  function alMover(e: React.TouchEvent) {
    if (inicioY.current === null) return

    const delta = (e.touches[0]?.clientY ?? 0) - inicioY.current
    // Solo hacia abajo: arrastrar hacia arriba no cierra nada.
    const haciaAbajo = Math.max(0, delta)

    desplazamientoRef.current = haciaAbajo
    setDesplazamiento(haciaAbajo)
  }

  function alSoltar() {
    setArrastrando(false)
    inicioY.current = null

    const recorrido = desplazamientoRef.current
    desplazamientoRef.current = 0

    if (recorrido > UMBRAL_CIERRE) onCerrar()
    else setDesplazamiento(0)
  }

  if (!actual) return null

  // La opacidad del fondo acompaña al arrastre: da la sensación de que la
  // imagen se está soltando, en vez de un corte seco.
  const opacidad = Math.max(0.35, 1 - desplazamiento / 420)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={actual.alt}
      className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain"
      style={{ backgroundColor: `rgba(0, 0, 0, ${opacidad})` }}
      onTouchStart={alTocar}
      onTouchMove={alMover}
      onTouchEnd={alSoltar}
      onClick={(e) => {
        // Solo cierra al tocar el fondo, no la imagen ni los controles.
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
      >
        <X className="size-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element -- ruta protegida con redirect firmado, next/image no la resuelve */}
      <img
        src={actual.src}
        alt={actual.alt}
        className={cn(
          'max-h-full max-w-full object-contain p-4',
          !arrastrando && 'transition-transform duration-200',
        )}
        style={{ transform: `translateY(${desplazamiento}px)` }}
      />

      {hayVarias ? (
        <>
          <button
            type="button"
            onClick={anterior}
            aria-label="Imagen anterior"
            className="absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={siguiente}
            aria-label="Imagen siguiente"
            className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <ChevronRight className="size-5" />
          </button>

          <p className="absolute bottom-7 text-sm text-white/90 tabular-nums">
            {indice + 1} / {imagenes.length}
          </p>
        </>
      ) : null}

      <p className="absolute bottom-2 text-[11px] text-white/50">Deslizá hacia abajo para cerrar</p>
    </div>
  )
}
