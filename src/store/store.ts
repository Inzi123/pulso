import { produce, type Draft } from 'immer'
import { create } from 'zustand'
import {
  MODE_COLORS,
  createElement,
  createMode,
  createProject,
  createScreen,
  defaultDevice,
  uid,
} from '../model/defaults'
import {
  fitCamera,
  unionRects,
  zoomAt,
  type Camera,
} from '../model/geometry'
import {
  clearOverride,
  copyModeOverrides,
  isScreenAvailable,
  removeModeFromProject,
  resolveProps,
  writeProps,
  type EditScope,
} from '../model/modes'
import {
  cloneElements,
  cloneProject,
  cloneScreens,
  elementWorldRect,
  findScreen,
  nextScreenPosition,
  screenRect,
  screensInside,
} from '../model/project'
import type {
  DesignElement,
  ElementProps,
  ElementType,
  Id,
  Project,
  ProjectKind,
  PropKey,
  Rect,
  Screen,
  Section,
} from '../model/types'
import { TEMPLATES } from '../model/templates'
import { idbGet, idbGetMany, idbWrite } from './idb'

export type Tool =
  | 'move'
  | 'hand'
  | 'screen'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'icon'

export const DRAW_TOOLS: Partial<Record<Tool, ElementType>> = {
  rect: 'rect',
  ellipse: 'ellipse',
  text: 'text',
  button: 'button',
  input: 'input',
  image: 'image',
  icon: 'icon',
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'screens'; ids: Id[] }
  | { kind: 'elements'; screenId: Id; ids: Id[] }
  | { kind: 'section'; id: Id }

export const NO_SELECTION: Selection = { kind: 'none' }

type Clipboard =
  | { kind: 'elements'; fromScreenId: Id; elements: DesignElement[] }
  | { kind: 'screens'; screens: Screen[] }

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
}

export interface PlayerState {
  screenId: Id
  modeId: Id
}

interface State {
  projects: Record<Id, Project>
  order: Id[]
  openId: Id | null

  tool: Tool
  camera: Camera
  viewport: { w: number; h: number }
  selection: Selection
  modeId: Id
  scope: EditScope
  showFlows: boolean
  editingTextId: Id | null
  inspectorTab: 'design' | 'prototype'
  player: PlayerState | null
  compareScreenId: Id | null
  helpOpen: boolean
  panels: { left: boolean; right: boolean }
  past: Project[]
  future: Project[]
  clipboard: Clipboard | null
  toasts: Toast[]
  /** Ya se leyeron los proyectos guardados. */
  ready: boolean
  /** Panel del asistente abierto. */
  aiOpen: boolean
}

/* ---------- Persistencia ---------- */

// Cada proyecto se guarda aparte en IndexedDB y solo se reescribe el que cambió,
// en un momento ocioso. Las versiones anteriores guardaban todo junto (también en
// localStorage); eso solo se lee para migrar.
const LEGACY_KEYS = ['hilo:v1', 'pulso:v1']
const ORDER_KEY = 'hilo:v2:order'
const projectKey = (id: Id) => `hilo:v2:p:${id}`

type Saved = { projects: Project[]; order: Id[] }

function fromSaved(data: Saved): { projects: Record<Id, Project>; order: Id[] } {
  const projects: Record<Id, Project> = {}
  for (const p of data.projects) if (p?.id) projects[p.id] = p
  const order = data.order.filter((id) => projects[id])
  for (const id of Object.keys(projects)) if (!order.includes(id)) order.push(id)
  return { projects, order }
}

function loadLocalStorage(): { projects: Record<Id, Project>; order: Id[] } | null {
  try {
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key)
      if (raw) return fromSaved(JSON.parse(raw) as Saved)
    }
  } catch {
    /* datos dañados: se empieza de cero */
  }
  return null
}

function initialDocuments() {
  const saved = loadLocalStorage()
  if (saved && saved.order.length > 0) return saved
  const sample = TEMPLATES[0].build()
  return { projects: { [sample.id]: sample }, order: [sample.id], seeded: sample.id }
}

const docs = initialDocuments()

export const useStore = create<State>(() => ({
  projects: docs.projects,
  order: docs.order,
  openId: null,
  tool: 'move',
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { w: 1200, h: 800 },
  selection: NO_SELECTION,
  modeId: '',
  scope: 'all',
  showFlows: true,
  editingTextId: null,
  inspectorTab: 'design',
  player: null,
  compareScreenId: null,
  helpOpen: false,
  panels: { left: true, right: true },
  past: [],
  future: [],
  clipboard: null,
  toasts: [],
  ready: false,
  aiOpen: false,
}))

/** Último objeto guardado de cada proyecto: si no cambió, no se reescribe. */
const savedRefs = new Map<Id, Project>()
let savedOrder: Id[] | null = null
let idbOk = true
let hydrated = false
let warnedSave = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saving: Promise<void> = Promise.resolve()

async function persist() {
  const { projects, order } = useStore.getState()
  if (!idbOk) {
    // Sin IndexedDB (algunos modos privados): todo en localStorage, si cabe.
    try {
      localStorage.setItem(LEGACY_KEYS[0], JSON.stringify({ projects: order.map((id) => projects[id]), order }))
    } catch {
      warnSave()
    }
    return
  }
  const puts: [string, unknown][] = []
  const written: [Id, Project][] = []
  for (const id of order) {
    const p = projects[id]
    if (p && savedRefs.get(id) !== p) {
      puts.push([projectKey(id), p])
      written.push([id, p])
    }
  }
  const removed = [...savedRefs.keys()].filter((id) => !projects[id])
  if (order !== savedOrder) puts.push([ORDER_KEY, order])
  if (!puts.length && !removed.length) return
  try {
    await idbWrite(puts, removed.map(projectKey))
    for (const [id, p] of written) savedRefs.set(id, p)
    for (const id of removed) savedRefs.delete(id)
    savedOrder = order
  } catch {
    warnSave()
  }
}

function warnSave() {
  if (warnedSave) return
  warnedSave = true
  toast('No se pudieron guardar los cambios en este navegador. Exporta el proyecto para no perderlo.', 'error')
}

/** Guarda ya (encadenado para que dos guardados no se pisen). */
function flush() {
  clearTimeout(saveTimer)
  saving = saving.then(persist, persist)
  return saving
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (idle) idle(() => void flush(), { timeout: 2000 })
    else void flush()
  }, 600)
}

useStore.subscribe((state, prev) => {
  if (state.projects === prev.projects && state.order === prev.order) return
  if (hydrated) scheduleSave()
})

if (typeof document !== 'undefined') {
  // Al cambiar de pestaña o cerrar, lo pendiente se guarda enseguida.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hydrated) void flush()
  })
}

async function readSaved(): Promise<{ projects: Record<Id, Project>; order: Id[] } | null> {
  const order = await idbGet<Id[]>(ORDER_KEY)
  if (order) {
    const list = await idbGetMany<Project>(order.map(projectKey))
    const data = fromSaved({ projects: list.filter((p): p is Project => !!p), order })
    for (const id of data.order) savedRefs.set(id, data.projects[id])
    savedOrder = data.order
    return data
  }
  // Formato anterior: todo junto bajo una clave.
  const legacy = await idbGet<Saved>(LEGACY_KEYS[0])
  return legacy && Array.isArray(legacy.projects) && legacy.projects.length ? fromSaved(legacy) : null
}

/** Al arrancar se leen los proyectos de IndexedDB; hasta entonces la app espera. */
void (async () => {
  try {
    const saved = await readSaved()
    if (saved && saved.order.length) {
      const { projects, order } = saved
      // Lo creado o abierto antes de terminar de leer (raro) se conserva tal cual está.
      const current = useStore.getState()
      const seeded = (docs as { seeded?: string }).seeded
      for (const id of current.order) {
        if (id === seeded && current.openId !== id) continue
        if (!projects[id]) order.unshift(id)
        if (!projects[id] || current.openId === id) projects[id] = current.projects[id]
      }
      useStore.setState({ projects, order })
    }
  } catch {
    idbOk = false
  }
  hydrated = true
  useStore.setState({ ready: true })
  await flush()
  if (idbOk && !warnedSave) {
    // Migrado: las copias del formato anterior ya no hacen falta.
    try {
      for (const key of LEGACY_KEYS) localStorage.removeItem(key)
      await idbWrite([], [LEGACY_KEYS[0]])
    } catch {
      /* nada */
    }
  }
})()

/* ---------- Utilidades ---------- */

const get = useStore.getState
const set = useStore.setState

export function currentProject(): Project | null {
  const { openId, projects } = get()
  return openId ? (projects[openId] ?? null) : null
}

let toastSeq = 0
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
}

const HISTORY_LIMIT = 120

/**
 * Modifica el proyecto abierto. Con `record` (por defecto) el estado anterior
 * se guarda para poder deshacer.
 */
export function mutate(
  recipe: (draft: Draft<Project>) => void,
  record = true,
  /** Cambios seguidos con la misma clave se agrupan en un solo paso. */
  coalesceKey?: string,
) {
  const project = currentProject()
  if (!project) return
  const next = produce(project, (d) => {
    recipe(d)
    d.updatedAt = Date.now()
  })
  if (next === project) return
  const now = Date.now()
  const coalesce = !!coalesceKey && coalesceKey === lastCoalesce.key && now - lastCoalesce.time < 1200
  lastCoalesce = { key: coalesceKey ?? null, time: now }
  set((s) => ({
    projects: { ...s.projects, [next.id]: next },
    ...(record && !gestureBase && !coalesce
      ? { past: [...s.past, project].slice(-HISTORY_LIMIT), future: [] }
      : {}),
  }))
}

let lastCoalesce: { key: string | null; time: number } = { key: null, time: 0 }

/* Gestos (arrastrar, redimensionar): un único paso de historial. */
let gestureBase: Project | null = null

export function beginGesture() {
  gestureBase = currentProject()
}

export function endGesture() {
  const base = gestureBase
  gestureBase = null
  const project = currentProject()
  if (!base || !project || base === project) return
  set((s) => ({ past: [...s.past, base].slice(-HISTORY_LIMIT), future: [] }))
}

function replaceProject(project: Project) {
  set((s) => ({ projects: { ...s.projects, [project.id]: project } }))
}

/** Quita de la selección lo que ya no existe (tras deshacer o borrar). */
function sanitizeSelection() {
  const project = currentProject()
  const sel = get().selection
  if (!project || sel.kind === 'none') return
  if (sel.kind === 'section') {
    if (!project.sections?.some((x) => x.id === sel.id)) set({ selection: NO_SELECTION })
  } else if (sel.kind === 'screens') {
    const ids = sel.ids.filter((id) => findScreen(project, id))
    set({ selection: ids.length ? { kind: 'screens', ids } : NO_SELECTION })
  } else {
    const screen = findScreen(project, sel.screenId)
    const ids = screen ? sel.ids.filter((id) => screen.elements.some((e) => e.id === id)) : []
    set({ selection: ids.length ? { ...sel, ids } : NO_SELECTION })
  }
}

export function undo() {
  const { past, future } = get()
  const project = currentProject()
  if (!project || past.length === 0) return
  const prev = past[past.length - 1]
  set({ past: past.slice(0, -1), future: [project, ...future] })
  replaceProject(prev)
  ensureValidMode()
  sanitizeSelection()
}

export function redo() {
  const { past, future } = get()
  const project = currentProject()
  if (!project || future.length === 0) return
  const next = future[0]
  set({ past: [...past, project], future: future.slice(1) })
  replaceProject(next)
  ensureValidMode()
  sanitizeSelection()
}

function ensureValidMode() {
  const project = currentProject()
  if (!project) return
  if (!project.modes.some((m) => m.id === get().modeId)) set({ modeId: project.modes[0].id })
}

/* ---------- Proyectos ---------- */

function touchOrder(id: Id) {
  set((s) => ({ order: [id, ...s.order.filter((x) => x !== id)] }))
}

export function addProject(project: Project) {
  set((s) => ({ projects: { ...s.projects, [project.id]: project } }))
  touchOrder(project.id)
  return project.id
}

export function newProject(name: string, kind: ProjectKind) {
  return addProject(createProject(name, kind))
}

export function newFromTemplate(templateId: string) {
  const tpl = TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) return null
  return addProject(tpl.build())
}

export function duplicateProject(id: Id) {
  const p = get().projects[id]
  if (!p) return
  addProject(cloneProject(p, `${p.name} (copia)`))
}

export function deleteProject(id: Id) {
  set((s) => {
    const projects = { ...s.projects }
    delete projects[id]
    return { projects, order: s.order.filter((x) => x !== id) }
  })
}

export function renameProject(id: Id, name: string) {
  const p = get().projects[id]
  if (!p || !name.trim()) return
  set((s) => ({ projects: { ...s.projects, [id]: { ...p, name: name.trim(), updatedAt: Date.now() } } }))
}

export function openProject(id: Id) {
  const p = get().projects[id]
  if (!p) return
  touchOrder(id)
  set({
    openId: id,
    modeId: p.modes[0].id,
    scope: 'all',
    selection: NO_SELECTION,
    tool: 'move',
    past: [],
    future: [],
    editingTextId: null,
    player: null,
    compareScreenId: null,
  })
  requestAnimationFrame(() => zoomToFit())
}

export function closeProject() {
  set({ openId: null, player: null, selection: NO_SELECTION, past: [], future: [] })
}

/* ---------- Selección y herramientas ---------- */

export function select(selection: Selection) {
  set({ selection, editingTextId: null })
}

export function setTool(tool: Tool) {
  set({ tool, editingTextId: null })
}

export function selectedScreenIds(): Id[] {
  const sel = get().selection
  if (sel.kind === 'screens') return sel.ids
  if (sel.kind === 'elements') return [sel.screenId]
  return []
}

/** Pantalla "de contexto": la seleccionada o la del elemento seleccionado. */
export function contextScreenId(): Id | null {
  return selectedScreenIds()[0] ?? null
}

/* ---------- Modos ---------- */

export function setMode(modeId: Id) {
  set({ modeId })
}

export function setScope(scope: EditScope) {
  set({ scope })
}

export function addMode(name: string, copyFrom?: Id) {
  const project = currentProject()
  if (!project) return
  const mode = createMode(name, project.modes.length)
  mutate((d) => {
    d.modes.push(mode)
    if (copyFrom) copyModeOverrides(d as Project, copyFrom, mode.id)
  })
  set({ modeId: mode.id })
}

export function updateMode(modeId: Id, patch: { name?: string; color?: string }) {
  mutate((d) => {
    const m = d.modes.find((x) => x.id === modeId)
    if (!m) return
    if (patch.name !== undefined && patch.name.trim()) m.name = patch.name.trim()
    if (patch.color) m.color = patch.color
  })
}

export function deleteMode(modeId: Id) {
  const project = currentProject()
  if (!project || project.modes.length <= 1) return
  mutate((d) => removeModeFromProject(d as Project, modeId))
  ensureValidMode()
}

export function moveMode(modeId: Id, dir: -1 | 1) {
  mutate((d) => {
    const i = d.modes.findIndex((m) => m.id === modeId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.modes.length) return
    const [m] = d.modes.splice(i, 1)
    d.modes.splice(j, 0, m)
  })
}

/* ---------- Edición de elementos ---------- */

function draftScreen(d: Draft<Project>, id: Id) {
  return d.screens.find((s) => s.id === id)
}

/** Cambia propiedades de elementos respetando el modo y el alcance activos. */
export function updateElements(
  screenId: Id,
  ids: Id[],
  patch: Partial<ElementProps> | ((current: ElementProps, el: DesignElement) => Partial<ElementProps>),
  record = true,
  coalesceKey?: string,
) {
  const { modeId, scope } = get()
  mutate((d) => {
    const screen = draftScreen(d, screenId)
    if (!screen) return
    for (const el of screen.elements) {
      if (!ids.includes(el.id)) continue
      const p = typeof patch === 'function' ? patch(resolveProps(el as DesignElement, modeId), el as DesignElement) : patch
      writeProps(el as DesignElement, p, modeId, scope)
    }
  }, record, coalesceKey)
}

export function resetOverrides(screenId: Id, ids: Id[], keys?: PropKey[]) {
  const { modeId } = get()
  mutate((d) => {
    const screen = draftScreen(d, screenId)
    if (!screen) return
    for (const el of screen.elements) if (ids.includes(el.id)) clearOverride(el as DesignElement, modeId, keys)
  })
}

export function renameElement(screenId: Id, elId: Id, name: string) {
  if (!name.trim()) return
  mutate((d) => {
    const el = draftScreen(d, screenId)?.elements.find((e) => e.id === elId)
    if (el) el.name = name.trim()
  })
}

export function updateScreen(
  screenId: Id,
  patch: Partial<Omit<Screen, 'id' | 'elements'>>,
  record = true,
  coalesceKey?: string,
) {
  mutate((d) => {
    const s = draftScreen(d, screenId)
    if (s) Object.assign(s, patch)
  }, record, coalesceKey)
}

export function setScreenAvailability(screenId: Id, modeId: Id, available: boolean) {
  mutate((d) => {
    const s = draftScreen(d, screenId)
    if (!s) return
    s.excludedModes = s.excludedModes.filter((m) => m !== modeId)
    if (!available) s.excludedModes.push(modeId)
  })
}

export function setStartScreen(screenId: Id | null) {
  mutate((d) => {
    d.startScreenId = screenId
  })
}

export function addScreen(width?: number, height?: number, at?: { x: number; y: number }) {
  const project = currentProject()
  if (!project) return null
  const device = defaultDevice(project.kind)
  const pos = at ?? nextScreenPosition(project)
  const screen = createScreen(
    `Pantalla ${project.screens.length + 1}`,
    Math.round(pos.x),
    Math.round(pos.y),
    width ?? device.width,
    height ?? device.height,
  )
  mutate((d) => {
    d.screens.push(screen)
    if (!d.startScreenId) d.startScreenId = screen.id
  })
  select({ kind: 'screens', ids: [screen.id] })
  return screen.id
}

export function addElement(screenId: Id, type: ElementType, props: Partial<ElementProps>) {
  const el = createElement(type, props)
  const { modeId, scope } = get()
  const project = currentProject()
  mutate((d) => {
    const s = draftScreen(d, screenId)
    if (!s) return
    // Creado en «solo este modo»: el elemento solo existe en el modo activo.
    if (scope === 'mode' && project && project.modes.length > 1) {
      el.props.hidden = true
      el.overrides[modeId] = { hidden: false }
    }
    s.elements.push(el)
  })
  set({ selection: { kind: 'elements', screenId, ids: [el.id] }, tool: 'move' })
  return el.id
}

export function deleteSelection() {
  const sel = get().selection
  if (sel.kind === 'section') {
    mutate((d) => {
      d.sections = (d.sections ?? []).filter((x) => x.id !== sel.id)
    })
  } else if (sel.kind === 'screens') {
    mutate((d) => {
      d.screens = d.screens.filter((s) => !sel.ids.includes(s.id))
      if (d.startScreenId && sel.ids.includes(d.startScreenId)) d.startScreenId = d.screens[0]?.id ?? null
    })
  } else if (sel.kind === 'elements') {
    mutate((d) => {
      const s = draftScreen(d, sel.screenId)
      if (s) s.elements = s.elements.filter((e) => !sel.ids.includes(e.id))
    })
  }
  select(NO_SELECTION)
}

export function copySelection() {
  const project = currentProject()
  const sel = get().selection
  if (!project) return
  if (sel.kind === 'screens') {
    set({ clipboard: { kind: 'screens', screens: project.screens.filter((s) => sel.ids.includes(s.id)) } })
  } else if (sel.kind === 'elements') {
    const screen = findScreen(project, sel.screenId)
    if (!screen) return
    set({
      clipboard: {
        kind: 'elements',
        fromScreenId: screen.id,
        elements: screen.elements.filter((e) => sel.ids.includes(e.id)),
      },
    })
  }
}

export function paste() {
  const project = currentProject()
  const clip = get().clipboard
  if (!project || !clip) return
  if (clip.kind === 'screens') {
    const { screens } = cloneScreens(clip.screens)
    const bounds = unionRects(screens.map(screenRect))!
    const pos = nextScreenPosition(project)
    for (const s of screens) {
      s.x = s.x - bounds.x + pos.x
      s.y = s.y - bounds.y + pos.y
      s.name = `${s.name} (copia)`
    }
    // Los modos pueden no coincidir si se pega en otro proyecto.
    const modeIds = new Set(project.modes.map((m) => m.id))
    for (const s of screens) {
      s.excludedModes = s.excludedModes.filter((m) => modeIds.has(m))
    }
    mutate((d) => {
      d.screens.push(...screens)
    })
    select({ kind: 'screens', ids: screens.map((s) => s.id) })
    return
  }
  const targetId = contextScreenId() ?? (findScreen(project, clip.fromScreenId) ? clip.fromScreenId : project.screens[0]?.id)
  if (!targetId) return
  const els = cloneElements(clip.elements)
  const offset = targetId === clip.fromScreenId ? 16 : 0
  for (const el of els) {
    el.props.x += offset
    el.props.y += offset
    for (const ov of Object.values(el.overrides)) {
      if (ov.x !== undefined) ov.x += offset
      if (ov.y !== undefined) ov.y += offset
    }
  }
  mutate((d) => {
    draftScreen(d, targetId)?.elements.push(...els)
  })
  select({ kind: 'elements', screenId: targetId, ids: els.map((e) => e.id) })
}

export function duplicateSelection() {
  const clip = get().clipboard
  copySelection()
  paste()
  set({ clipboard: clip })
}

/** Duplica la selección en el mismo sitio (para Alt+arrastrar). */
export function duplicateInPlace(): Selection {
  const project = currentProject()
  const sel = get().selection
  if (!project) return sel
  if (sel.kind === 'elements') {
    const screen = findScreen(project, sel.screenId)
    if (!screen) return sel
    const els = cloneElements(screen.elements.filter((e) => sel.ids.includes(e.id)))
    mutate((d) => {
      draftScreen(d, sel.screenId)?.elements.push(...els)
    }, false)
    const next: Selection = { kind: 'elements', screenId: sel.screenId, ids: els.map((e) => e.id) }
    set({ selection: next })
    return next
  }
  if (sel.kind === 'screens') {
    const { screens } = cloneScreens(project.screens.filter((s) => sel.ids.includes(s.id)))
    for (const s of screens) s.name = `${s.name} (copia)`
    mutate((d) => {
      d.screens.push(...screens)
    }, false)
    const next: Selection = { kind: 'screens', ids: screens.map((s) => s.id) }
    set({ selection: next })
    return next
  }
  return sel
}

export function reorderSelection(where: 'front' | 'back' | 'forward' | 'backward') {
  const sel = get().selection
  if (sel.kind === 'elements') {
    mutate((d) => {
      const s = draftScreen(d, sel.screenId)
      if (!s) return
      s.elements = reorder(s.elements, sel.ids, where) as typeof s.elements
    })
  } else if (sel.kind === 'screens') {
    mutate((d) => {
      d.screens = reorder(d.screens, sel.ids, where) as typeof d.screens
    })
  }
}

function reorder<T extends { id: Id }>(list: T[], ids: Id[], where: 'front' | 'back' | 'forward' | 'backward'): T[] {
  const moving = list.filter((x) => ids.includes(x.id))
  const rest = list.filter((x) => !ids.includes(x.id))
  if (where === 'front') return [...rest, ...moving]
  if (where === 'back') return [...moving, ...rest]
  const result = [...list]
  if (where === 'forward') {
    for (let i = result.length - 2; i >= 0; i--) {
      if (ids.includes(result[i].id) && !ids.includes(result[i + 1].id)) {
        ;[result[i], result[i + 1]] = [result[i + 1], result[i]]
      }
    }
  } else {
    for (let i = 1; i < result.length; i++) {
      if (ids.includes(result[i].id) && !ids.includes(result[i - 1].id)) {
        ;[result[i], result[i - 1]] = [result[i - 1], result[i]]
      }
    }
  }
  return result
}

export function nudgeSelection(dx: number, dy: number) {
  const sel = get().selection
  if (sel.kind === 'section') {
    moveSection(sel.id, dx, dy)
  } else if (sel.kind === 'elements') {
    updateElements(sel.screenId, sel.ids, (p) => ({ x: p.x + dx, y: p.y + dy }))
  } else if (sel.kind === 'screens') {
    mutate((d) => {
      for (const s of d.screens) {
        if (sel.ids.includes(s.id)) {
          s.x += dx
          s.y += dy
        }
      }
    })
  }
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** Alinea los elementos seleccionados (a la pantalla si solo hay uno). */
export function alignSelection(kind: AlignKind) {
  const project = currentProject()
  const sel = get().selection
  const { modeId } = get()
  if (!project || sel.kind !== 'elements') return
  const screen = findScreen(project, sel.screenId)
  if (!screen) return
  const els = screen.elements.filter((e) => sel.ids.includes(e.id))
  const rects = els.map((e) => {
    const p = resolveProps(e, modeId)
    return { x: p.x, y: p.y, width: p.width, height: p.height }
  })
  const box: Rect = els.length === 1 ? { x: 0, y: 0, width: screen.width, height: screen.height } : unionRects(rects)!
  updateElements(screen.id, sel.ids, (p) => {
    switch (kind) {
      case 'left':
        return { x: Math.round(box.x) }
      case 'hcenter':
        return { x: Math.round(box.x + box.width / 2 - p.width / 2) }
      case 'right':
        return { x: Math.round(box.x + box.width - p.width) }
      case 'top':
        return { y: Math.round(box.y) }
      case 'vcenter':
        return { y: Math.round(box.y + box.height / 2 - p.height / 2) }
      case 'bottom':
        return { y: Math.round(box.y + box.height - p.height) }
    }
  })
}

/**
 * Mueve elementos a otra pantalla manteniendo su posición en el canvas
 * (también la de cada modo que tenga su propia posición).
 */
export function moveElementsToScreen(fromId: Id, ids: Id[], toId: Id) {
  const project = currentProject()
  if (!project || fromId === toId) return
  const from = findScreen(project, fromId)
  const to = findScreen(project, toId)
  if (!from || !to) return
  const dx = from.x - to.x
  const dy = from.y - to.y
  mutate((d) => {
    const src = draftScreen(d, fromId)!
    const dst = draftScreen(d, toId)!
    const moving = src.elements.filter((e) => ids.includes(e.id))
    src.elements = src.elements.filter((e) => !ids.includes(e.id))
    for (const el of moving) {
      el.props.x += dx
      el.props.y += dy
      for (const ov of Object.values(el.overrides)) {
        if (ov.x !== undefined) ov.x += dx
        if (ov.y !== undefined) ov.y += dy
      }
      dst.elements.push(el)
    }
  }, false)
  set({ selection: { kind: 'elements', screenId: toId, ids } })
}

/* ---------- Secciones ---------- */

export function addSectionAround(ids: Id[]) {
  const project = currentProject()
  if (!project) return null
  const rects = project.screens.filter((s) => ids.includes(s.id)).map(screenRect)
  const b = unionRects(rects)
  if (!b) return null
  const n = (project.sections?.length ?? 0) + 1
  const section: Section = {
    id: uid('sec'),
    name: `Sección ${n}`,
    x: Math.round(b.x - 80),
    y: Math.round(b.y - 130),
    width: Math.round(b.width + 160),
    height: Math.round(b.height + 210),
    color: MODE_COLORS[(n - 1) % MODE_COLORS.length],
  }
  mutate((d) => {
    ;(d.sections ??= []).push(section)
  })
  select({ kind: 'section', id: section.id })
  return section.id
}

export function updateSection(id: Id, patch: Partial<Omit<Section, 'id'>>, record = true, coalesceKey?: string) {
  mutate((d) => {
    const s = d.sections?.find((x) => x.id === id)
    if (s) Object.assign(s, patch)
  }, record, coalesceKey)
}

/** Mueve una sección junto con las pantallas que contiene. */
export function moveSection(id: Id, dx: number, dy: number, record = true) {
  const project = currentProject()
  const sec = project?.sections?.find((x) => x.id === id)
  if (!project || !sec) return
  const inside = new Set(screensInside(project, sec).map((s) => s.id))
  mutate((d) => {
    const s = d.sections?.find((x) => x.id === id)
    if (!s) return
    s.x += dx
    s.y += dy
    for (const sc of d.screens) {
      if (!inside.has(sc.id)) continue
      sc.x += dx
      sc.y += dy
    }
  }, record)
}

/* ---------- Cámara ---------- */

export function setCamera(camera: Camera) {
  set({ camera })
}

export function zoomBy(factor: number) {
  const { camera, viewport } = get()
  set({ camera: zoomAt(camera, viewport.w / 2, viewport.h / 2, camera.zoom * factor) })
}

export function zoomTo(zoom: number) {
  const { camera, viewport } = get()
  set({ camera: zoomAt(camera, viewport.w / 2, viewport.h / 2, zoom) })
}

export function zoomToRect(rect: Rect, maxZoom = 1) {
  const { viewport } = get()
  const pad = Math.min(80, Math.max(24, Math.min(viewport.w, viewport.h) * 0.08))
  set({ camera: fitCamera(rect, viewport.w, viewport.h, pad, maxZoom) })
}

export function zoomToFit() {
  const project = currentProject()
  if (!project || project.screens.length === 0) return
  zoomToRect(unionRects(project.screens.map(screenRect))!)
}

export function selectionBounds(): Rect | null {
  const project = currentProject()
  const { selection: sel, modeId } = get()
  if (!project) return null
  if (sel.kind === 'section') return project.sections?.find((x) => x.id === sel.id) ?? null
  if (sel.kind === 'screens') {
    return unionRects(project.screens.filter((s) => sel.ids.includes(s.id)).map(screenRect))
  }
  if (sel.kind === 'elements') {
    const screen = findScreen(project, sel.screenId)
    if (!screen) return null
    return unionRects(
      screen.elements.filter((e) => sel.ids.includes(e.id)).map((e) => elementWorldRect(screen, e, modeId)),
    )
  }
  return null
}

export function zoomToSelection() {
  const rect = selectionBounds()
  if (rect) zoomToRect(rect, 4)
  else zoomToFit()
}

export function focusScreen(id: Id) {
  const project = currentProject()
  const s = project && findScreen(project, id)
  if (s) zoomToRect(screenRect(s))
}

/* ---------- Prototipo ---------- */

export function play(screenId?: Id) {
  const project = currentProject()
  if (!project) return
  const { modeId } = get()
  const available = (id: Id | null | undefined) => {
    const s = id ? findScreen(project, id) : undefined
    return s && isScreenAvailable(s, modeId) ? s.id : null
  }
  const target =
    available(screenId) ??
    available(contextScreenId()) ??
    available(project.startScreenId) ??
    project.screens.find((s) => isScreenAvailable(s, modeId))?.id
  if (!target) {
    toast('No hay pantallas disponibles en este modo.', 'error')
    return
  }
  set({ player: { screenId: target, modeId }, editingTextId: null })
}

export function closePlayer() {
  set({ player: null })
}

export function setPlayerMode(modeId: Id) {
  const pl = get().player
  if (pl) set({ player: { ...pl, modeId } })
}

/* ---------- Varios ---------- */

export function togglePanel(which: 'left' | 'right', value?: boolean) {
  set((s) => ({ panels: { ...s.panels, [which]: value ?? !s.panels[which] } }))
}

export { get as getState, set as setState }
