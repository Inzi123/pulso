import type {
  DesignElement,
  ElementProps,
  ElementType,
  Interaction,
  Mode,
  Project,
  ProjectKind,
  Screen,
} from './types'

let counter = 0
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`
}

export const MODE_COLORS = [
  '#f08a3c',
  '#9b6cf2',
  '#e5487f',
  '#e9b23a',
  '#4c8dff',
  '#8cc152',
  '#e5484d',
  '#2bb5a6',
]

export const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: 'Geist', label: 'Geist' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'Fraunces', label: 'Fraunces (serif)' },
  { value: 'Nunito', label: 'Nunito' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'Geist Mono', label: 'Geist Mono' },
  { value: 'system-ui', label: 'Sistema' },
]

export interface DevicePreset {
  id: string
  label: string
  width: number
  height: number
  kind: ProjectKind
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, kind: 'app' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, kind: 'app' },
  { id: 'android', label: 'Android', width: 360, height: 800, kind: 'app' },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180, kind: 'app' },
  { id: 'desktop', label: 'Escritorio', width: 1440, height: 1024, kind: 'web' },
  { id: 'laptop', label: 'Portátil', width: 1280, height: 832, kind: 'web' },
  { id: 'web-mobile', label: 'Web móvil', width: 390, height: 844, kind: 'web' },
]

export function defaultDevice(kind: ProjectKind): DevicePreset {
  return kind === 'app' ? DEVICE_PRESETS[0] : DEVICE_PRESETS[4]
}

export const BASE_PROPS: ElementProps = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  hidden: false,
  opacity: 1,
  fill: '#d9dce3',
  stroke: '',
  strokeWidth: 0,
  radius: 0,
  shadow: 'none',
  blur: 0,
  mask: '',
  filter: '',
  blend: '',
  text: '',
  color: '#16181d',
  fontFamily: 'Geist',
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.35,
  letterSpacing: 0,
  italic: false,
  nowrap: false,
  textAlign: 'left',
  src: '',
  fit: 'cover',
  icon: 'star',
  fixed: false,
  interaction: null,
}

const TYPE_DEFAULTS: Record<ElementType, Partial<ElementProps>> = {
  rect: { width: 160, height: 100, radius: 8 },
  ellipse: { width: 100, height: 100, fill: '#c9d2ff' },
  text: { width: 200, height: 24, fill: '', text: 'Texto' },
  button: {
    width: 200,
    height: 48,
    fill: '#1f3bd6',
    radius: 12,
    text: 'Botón',
    color: '#ffffff',
    fontWeight: 600,
    textAlign: 'center',
  },
  input: {
    width: 280,
    height: 48,
    fill: '#ffffff',
    stroke: '#c8ccd6',
    strokeWidth: 1,
    radius: 10,
    text: 'Escribe aquí…',
    color: '#8a8f9c',
  },
  image: { width: 240, height: 160, fill: '#e6e8ee', radius: 12 },
  icon: { width: 24, height: 24, fill: '', color: '#16181d', icon: 'star' },
}

export const TYPE_LABELS: Record<ElementType, string> = {
  rect: 'Rectángulo',
  ellipse: 'Elipse',
  text: 'Texto',
  button: 'Botón',
  input: 'Campo',
  image: 'Imagen',
  icon: 'Icono',
}

export function createElement(
  type: ElementType,
  props: Partial<ElementProps> = {},
  name?: string,
): DesignElement {
  return {
    id: uid('el'),
    type,
    name: name ?? TYPE_LABELS[type],
    props: { ...BASE_PROPS, ...TYPE_DEFAULTS[type], ...props },
    overrides: {},
  }
}

export function createScreen(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Screen {
  return {
    id: uid('scr'),
    name,
    x,
    y,
    width,
    height,
    fill: '#ffffff',
    excludedModes: [],
    elements: [],
  }
}

export function createMode(name: string, index: number): Mode {
  return { id: uid('mode'), name, color: MODE_COLORS[index % MODE_COLORS.length] }
}

export function defaultInteraction(target: string | null = null): Interaction {
  return { action: 'navigate', target, transition: 'dissolve', url: '' }
}

export function createProject(name: string, kind: ProjectKind): Project {
  const device = defaultDevice(kind)
  const first = createScreen('Inicio', 0, 0, device.width, device.height)
  const now = Date.now()
  return {
    id: uid('prj'),
    name,
    kind,
    viewportHeight: device.height,
    modes: [createMode('Predeterminado', 0)],
    screens: [first],
    startScreenId: first.id,
    createdAt: now,
    updatedAt: now,
  }
}
