import type { CSSProperties } from 'react'

type IconDef = { paths: string[]; circles?: [number, number, number][]; fill?: boolean }

/**
 * Iconos de trazo en una rejilla de 24×24. Los de `DESIGN_ICONS` se pueden
 * usar dentro de los diseños; el resto son para la interfaz del editor.
 */
const ICONS: Record<string, IconDef> = {
  // --- Diseño ---
  home: { paths: ['M3 11l9-8 9 8', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'] },
  calendar: {
    paths: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  },
  chat: { paths: ['M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'] },
  user: { paths: ['M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'], circles: [[12, 8, 4]] },
  users: {
    paths: ['M2 20c1.2-3.4 3.6-5 7-5s5.8 1.6 7 5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.5c2 .6 3.3 2.4 4 5.5'],
    circles: [[9, 8, 3.5]],
  },
  video: { paths: ['M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M15 10.5l6-3.5v10l-6-3.5'] },
  lock: { paths: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V7a4 4 0 0 1 8 0v4'] },
  star: { paths: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z'] },
  check: { paths: ['M5 12.5l4.5 4.5L19 7'] },
  'check-circle': { paths: ['M8 12.5l3 3 5-6'], circles: [[12, 12, 9]] },
  'arrow-left': { paths: ['M19 12H5', 'M11 6l-6 6 6 6'] },
  'arrow-right': { paths: ['M5 12h14', 'M13 6l6 6-6 6'] },
  'chevron-left': { paths: ['M15 6l-6 6 6 6'] },
  'chevron-right': { paths: ['M9 6l6 6-6 6'] },
  'chevron-down': { paths: ['M6 9l6 6 6-6'] },
  menu: { paths: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  search: { paths: ['M20 20l-4.6-4.6'], circles: [[11, 11, 6.5]] },
  bell: { paths: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'] },
  heart: { paths: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'] },
  sliders: { paths: ['M4 7h9', 'M19 7h1', 'M4 17h1', 'M11 17h9'], circles: [[16, 7, 2.5], [8, 17, 2.5]] },
  play: { paths: ['M8 5.5v13l10.5-6.5z'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  x: { paths: ['M6 6l12 12', 'M18 6L6 18'] },
  smile: { paths: ['M8.5 14.5a4.5 4.5 0 0 0 7 0', 'M9 9.5h.01', 'M15 9.5h.01'], circles: [[12, 12, 9]] },
  meh: { paths: ['M8.5 15h7', 'M9 9.5h.01', 'M15 9.5h.01'], circles: [[12, 12, 9]] },
  frown: { paths: ['M8.5 16a4.5 4.5 0 0 1 7 0', 'M9 9.5h.01', 'M15 9.5h.01'], circles: [[12, 12, 9]] },
  book: { paths: ['M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z', 'M5 20.5A2.5 2.5 0 0 0 7.5 23H19v-5'] },
  mic: { paths: ['M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'] },
  clock: { paths: ['M12 7v5l3 2'], circles: [[12, 12, 9]] },
  sparkles: { paths: ['M11 3l1.7 4.8L17.5 9.5l-4.8 1.7L11 16l-1.7-4.8L4.5 9.5l4.8-1.7z', 'M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z'] },
  mail: { paths: ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 7.5l9 6 9-6'] },
  shield: { paths: ['M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z'] },
  leaf: { paths: ['M5 19C5 11 11 5 20 4c-.5 9-6 15-14 15.5', 'M5 19l7-7'] },
  headphones: { paths: ['M4 15v-3a8 8 0 0 1 16 0v3', 'M4 15h3v6H5a1 1 0 0 1-1-1z', 'M20 15h-3v6h2a1 1 0 0 0 1-1z'] },
  chart: { paths: ['M4 20h16', 'M7 16v-4', 'M12 16V7', 'M17 16v-7'] },
  crown: { paths: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z'] },
  phone: { paths: ['M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'] },
  settings: {
    paths: ['M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
    circles: [[12, 12, 4]],
  },
  logout: { paths: ['M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', 'M15 8l4 4-4 4', 'M19 12H9'] },
  info: { paths: ['M12 11v6', 'M12 7.5h.01'], circles: [[12, 12, 9]] },
  card: { paths: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2 10h20', 'M6 15h4'] },
  'image-icon': { paths: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M21 15l-5-5-11 10'], circles: [[8.5, 9, 1.5]] },
  sun: {
    paths: ['M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
    circles: [[12, 12, 4]],
  },
  moon: { paths: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z'] },
  wind: { paths: ['M3 8h11a3 3 0 1 0-3-3', 'M3 12h16a3 3 0 1 1-3 3', 'M3 16h7'] },

  // --- Interfaz del editor ---
  cursor: { paths: ['M5 3l14 7.5-6.2 1.6L10 18.5z'] },
  hand: {
    paths: ['M8 13V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15'],
  },
  frame: { paths: ['M7 3v18', 'M17 3v18', 'M3 7h18', 'M3 17h18'] },
  square: { paths: ['M5 5h14v14H5z'] },
  circle: { paths: [], circles: [[12, 12, 8]] },
  type: { paths: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'] },
  'button-tool': { paths: ['M5 8h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z', 'M8 12h8'] },
  'input-tool': { paths: ['M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M7 10v4'] },
  layers: { paths: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'] },
  eye: { paths: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'], circles: [[12, 12, 3]] },
  'eye-off': { paths: ['M3 3l18 18', 'M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2', 'M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'] },
  link: { paths: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'] },
  flows: { paths: ['M4 6h5a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h5', 'M17 15l3 3-3 3'], circles: [[4, 6, 1.5]] },
  undo: { paths: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-2'] },
  redo: { paths: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h2'] },
  trash: { paths: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'] },
  copy: { paths: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'] },
  compare: { paths: ['M4 4h6v16H4z', 'M14 4h6v16h-6z'] },
  more: { paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'] },
  download: { paths: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'] },
  upload: { paths: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'] },
  'align-left': { paths: ['M4 3v18', 'M8 7h10', 'M8 13h6', 'M8 7v3h10V7', 'M8 13v4h6v-4'] },
  'align-hcenter': { paths: ['M12 3v18', 'M6 6h12v4H6z', 'M8 14h8v4H8z'] },
  'align-right': { paths: ['M20 3v18', 'M6 6h10v4H6z', 'M10 14h6v4h-6z'] },
  'align-top': { paths: ['M3 4h18', 'M6 8h4v10H6z', 'M14 8h4v6h-4z'] },
  'align-vcenter': { paths: ['M3 12h18', 'M6 6h4v12H6z', 'M14 8h4v8h-4z'] },
  'align-bottom': { paths: ['M3 20h18', 'M6 6h4v10H6z', 'M14 10h4v6h-4z'] },
  'text-left': { paths: ['M4 6h16', 'M4 12h10', 'M4 18h13'] },
  'text-center': { paths: ['M4 6h16', 'M7 12h10', 'M5.5 18h13'] },
  'text-right': { paths: ['M4 6h16', 'M10 12h10', 'M7 18h13'] },
  reset: { paths: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v5h5'] },
  keyboard: { paths: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M7 10h.01', 'M11 10h.01', 'M15 10h.01', 'M8 14h8'] },
  restart: { paths: ['M20 12a8 8 0 1 1-2.5-5.8', 'M20 4v5h-5'] },
  panel: { paths: ['M4 4h16v16H4z', 'M9 4v16'] },
  'panel-right': { paths: ['M4 4h16v16H4z', 'M15 4v16'] },
  zap: { paths: ['M13 2L4 14h7l-1 8 9-12h-7z'] },
  grid: { paths: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'] },
  globe: { paths: ['M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'], circles: [[12, 12, 9]] },
  smartphone: { paths: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'] },
  edit: { paths: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'] },
  folder: { paths: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'] },
}

export const DESIGN_ICONS = [
  'home', 'calendar', 'chat', 'user', 'users', 'video', 'lock', 'star', 'check', 'check-circle',
  'arrow-left', 'arrow-right', 'chevron-left', 'chevron-right', 'chevron-down', 'menu', 'search',
  'bell', 'heart', 'sliders', 'play', 'plus', 'x', 'smile', 'meh', 'frown', 'book', 'mic', 'clock',
  'sparkles', 'mail', 'shield', 'leaf', 'headphones', 'chart', 'crown', 'phone', 'settings',
  'logout', 'info', 'card', 'image-icon', 'sun', 'moon', 'wind', 'globe', 'smartphone', 'edit',
]

interface IconProps {
  name: string
  size?: number | string
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, style }: IconProps) {
  const def = ICONS[name] ?? ICONS.star
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {def.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {def.circles?.map(([cx, cy, r], i) => (
        <circle key={`c${i}`} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  )
}
