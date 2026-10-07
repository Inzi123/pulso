import { BASE_PROPS, uid } from './defaults'
import { resolveProps } from './modes'
import type { DesignElement, Id, Project, Rect, Screen } from './types'

export function findScreen(project: Project, id: Id): Screen | undefined {
  return project.screens.find((s) => s.id === id)
}

export function findElement(
  project: Project,
  screenId: Id,
  elId: Id,
): DesignElement | undefined {
  return findScreen(project, screenId)?.elements.find((e) => e.id === elId)
}

/** Pantalla que contiene a un elemento. */
export function screenOfElement(project: Project, elId: Id): Screen | undefined {
  return project.screens.find((s) => s.elements.some((e) => e.id === elId))
}

export function screenRect(s: Screen): Rect {
  return { x: s.x, y: s.y, width: s.width, height: s.height }
}

/** Pantallas que quedan enteras dentro de una zona. */
export function screensInside(project: Project, r: Rect): Screen[] {
  return project.screens.filter(
    (s) => s.x >= r.x && s.y >= r.y && s.x + s.width <= r.x + r.width && s.y + s.height <= r.y + r.height,
  )
}

/** Rectángulo de un elemento en coordenadas del mundo, en un modo. */
export function elementWorldRect(screen: Screen, el: DesignElement, modeId: Id): Rect {
  const p = resolveProps(el, modeId)
  return { x: screen.x + p.x, y: screen.y + p.y, width: p.width, height: p.height }
}

/** Posición libre a la derecha de las pantallas existentes. */
export function nextScreenPosition(project: Project, gap = 120): { x: number; y: number } {
  if (project.screens.length === 0) return { x: 0, y: 0 }
  const minY = Math.min(...project.screens.map((s) => s.y))
  const maxX = Math.max(...project.screens.map((s) => s.x + s.width))
  return { x: maxX + gap, y: minY }
}

/**
 * Copia profunda con identificadores nuevos. Las interacciones que apuntan a
 * pantallas copiadas se reescriben para apuntar a las copias.
 */
export function cloneScreens(screens: Screen[]): { screens: Screen[]; idMap: Map<Id, Id> } {
  const idMap = new Map<Id, Id>()
  const copies: Screen[] = JSON.parse(JSON.stringify(screens))
  for (const s of copies) {
    const next = uid('scr')
    idMap.set(s.id, next)
    s.id = next
    for (const el of s.elements) el.id = uid('el')
  }
  for (const s of copies) {
    for (const el of s.elements) remapElementTargets(el, idMap)
    const auto = s.autoAdvance
    if (auto?.target && idMap.has(auto.target)) auto.target = idMap.get(auto.target)!
  }
  return { screens: copies, idMap }
}

export function remapElementTargets(el: DesignElement, idMap: Map<Id, Id>): void {
  const fix = (target: Id | null) => (target && idMap.has(target) ? idMap.get(target)! : target)
  if (el.props.interaction) el.props.interaction.target = fix(el.props.interaction.target)
  for (const ov of Object.values(el.overrides)) {
    if (ov.interaction) ov.interaction.target = fix(ov.interaction.target)
  }
}

export function cloneElements(elements: DesignElement[]): DesignElement[] {
  const copies: DesignElement[] = JSON.parse(JSON.stringify(elements))
  for (const el of copies) el.id = uid('el')
  return copies
}

/** Copia completa de un proyecto con identificadores nuevos. */
export function cloneProject(project: Project, name?: string): Project {
  const { screens, idMap } = cloneScreens(project.screens)
  const now = Date.now()
  return {
    ...JSON.parse(JSON.stringify(project)),
    id: uid('prj'),
    name: name ?? project.name,
    screens,
    startScreenId: project.startScreenId ? (idMap.get(project.startScreenId) ?? null) : null,
    createdAt: now,
    updatedAt: now,
  }
}

/* ---------- Importación ---------- */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Valida y completa un proyecto importado. Lanza un error con un mensaje
 * legible si el archivo no tiene el formato esperado.
 */
export function parseProject(raw: unknown): Project {
  if (!isObj(raw)) throw new Error('El archivo no contiene un proyecto.')
  const data = isObj(raw.project) ? raw.project : raw
  if (!Array.isArray(data.screens) || !Array.isArray(data.modes)) {
    throw new Error('Faltan pantallas o modos en el archivo.')
  }
  if (data.modes.length === 0) throw new Error('El proyecto necesita al menos un modo.')
  const project = data as unknown as Project
  for (const s of project.screens) {
    s.excludedModes ??= []
    s.fill ??= '#ffffff'
    s.elements ??= []
    for (const el of s.elements) {
      el.props = { ...BASE_PROPS, ...el.props }
      el.overrides ??= {}
    }
  }
  project.kind = project.kind === 'web' ? 'web' : 'app'
  project.viewportHeight ??= project.kind === 'app' ? 852 : 1024
  project.name = typeof project.name === 'string' && project.name ? project.name : 'Importado'
  project.startScreenId ??= project.screens[0]?.id ?? null
  project.sections = Array.isArray(project.sections) ? project.sections : []
  return cloneProject(project)
}
