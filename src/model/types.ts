export type Id = string

export type ProjectKind = 'app' | 'web'

export type ElementType =
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'icon'

export type Transition =
  | 'instant'
  | 'dissolve'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'

export type InteractionAction = 'navigate' | 'overlay' | 'back' | 'close' | 'url'

export interface Interaction {
  action: InteractionAction
  /** Pantalla destino para `navigate` y `overlay`. */
  target: Id | null
  transition: Transition
  /** Enlace externo para `url`. */
  url: string
}

export type Shadow = 'none' | 'sm' | 'md' | 'lg'
export type TextAlign = 'left' | 'center' | 'right'
export type ImageFit = 'cover' | 'contain'

/**
 * Todas las propiedades que puede tener un elemento. Son las mismas para
 * todos los tipos, lo que permite que los modos sobrescriban cualquiera de
 * ellas con el mismo mecanismo.
 */
export interface ElementProps {
  x: number
  y: number
  width: number
  height: number
  hidden: boolean
  opacity: number
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
  shadow: Shadow
  text: string
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  textAlign: TextAlign
  src: string
  fit: ImageFit
  icon: string
  /** Se queda fijo al hacer scroll en el prototipo (barras de navegación). */
  fixed: boolean
  interaction: Interaction | null
}

export type PropKey = keyof ElementProps

export type Overrides = Partial<ElementProps>

export interface DesignElement {
  id: Id
  type: ElementType
  name: string
  props: ElementProps
  /** Cambios por modo: modeId → propiedades que difieren de la base. */
  overrides: Record<Id, Overrides>
}

/** Pasa sola a otra pantalla tras un tiempo (cargas, escaneos, animaciones). */
export interface AutoAdvance {
  target: Id | null
  /** Milisegundos desde que se muestra la pantalla. */
  delay: number
  transition: Transition
}

export interface Screen {
  id: Id
  name: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  /** Modos en los que esta pantalla no existe. */
  excludedModes: Id[]
  elements: DesignElement[]
  autoAdvance?: AutoAdvance | null
}

export interface Mode {
  id: Id
  name: string
  color: string
}

export interface Project {
  id: Id
  name: string
  kind: ProjectKind
  /** Alto del viewport en el prototipo (las pantallas más altas hacen scroll). */
  viewportHeight: number
  modes: Mode[]
  screens: Screen[]
  startScreenId: Id | null
  createdAt: number
  updatedAt: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
