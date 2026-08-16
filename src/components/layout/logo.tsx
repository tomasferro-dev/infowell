import Image from 'next/image'

import logoArenas from '../../../public/logo-arenas.png'

/**
 * Logo de ARENAS Perforaciones.
 *
 * Se importa el archivo (no una ruta suelta) para que Next conozca sus
 * dimensiones y reserve el espacio: si no, el encabezado da un salto cuando
 * carga la imagen, que en el celular se nota mucho.
 *
 * `priority` porque está arriba de todo y aparece en la primera pantalla.
 */
export function LogoArenas({
  className,
  alto = 28,
}: {
  className?: string
  alto?: number
}) {
  const proporcion = 793 / 310

  return (
    <Image
      src={logoArenas}
      alt="ARENAS Perforaciones"
      height={alto}
      width={Math.round(alto * proporcion)}
      priority
      className={className}
    />
  )
}
