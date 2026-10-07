import { useId } from 'react'

/** Marca de Hilo: un hilo que une dos puntos, como un flujo entre pantallas. */
export function HiloMark({ size = 26 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Hilo" role="img">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3d" />
          <stop offset="1" stopColor="#f0433a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path
        d="M7 16c3-7 6-7 9 0s6 7 9 0"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="7" cy="16" r="2.4" fill="#fff" />
      <circle cx="25" cy="16" r="2.4" fill="#fff" />
    </svg>
  )
}
