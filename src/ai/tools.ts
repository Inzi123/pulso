import { BASE_PROPS, createElement, createScreen } from '../model/defaults'
import { resolveProps, setOverride } from '../model/modes'
import { findScreen, screenRect } from '../model/project'
import type { DesignElement, ElementProps, ElementType, Id, Interaction, Project, PropKey, Screen, Transition } from '../model/types'
import { intersects } from '../model/geometry'
import { addMode, currentProject, getState, mutate, select, setState, zoomToRect, zoomToSelection } from '../store/store'

/**
 * Herramientas que el asistente puede usar sobre el proyecto abierto. Son las
 * mismas para los dos motores (Claude en claude.ai y la API con tu clave). Cada
 * cambio pasa por `mutate`, así que se deshace con Ctrl+Z como cualquier otro.
 */
export interface AiTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  /** Devuelve datos simples para el modelo; si algo no se puede hacer, lanza un Error. */
  run(input: Record<string, unknown>, log: (line: string) => void): unknown
}

const TYPES: ElementType[] = ['rect', 'ellipse', 'text', 'button', 'input', 'image', 'icon']
const TRANSITIONS: Transition[] = ['instant', 'dissolve', 'slide-left', 'slide-right', 'slide-up']
const PROP_KEYS = new Set(Object.keys(BASE_PROPS))
const MAX_LIST = 120

/* ---------- Lectura y validación ---------- */

function project(): Project {
  const p = currentProject()
  if (!p) throw new Error('No hay ningún proyecto abierto.')
  return p
}

function screenOf(p: Project, id: unknown): Screen {
  const s = typeof id === 'string' ? findScreen(p, id) : undefined
  if (!s) throw new Error(`No existe la pantalla «${String(id)}». Usa get_project para ver los ids.`)
  return s
}

function modeOf(p: Project, id: unknown): Id {
  if (id === undefined || id === null || id === '') return getState().modeId
  const m = p.modes.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase())
  if (!m) throw new Error(`No existe el modo «${String(id)}». Modos: ${p.modes.map((x) => `${x.name} (${x.id})`).join(', ')}.`)
  return m.id
}

function short(value: string, max = 120) {
  if (value.startsWith('data:')) return `data:… (${value.slice(5, value.indexOf(/[;,]/.exec(value)?.[0] ?? ',')) || 'archivo'})`
  return value.length > max ? value.slice(0, max) + '…' : value
}

/** Una capa en pocas palabras: solo lo que distingue a esa capa. */
function describe(el: DesignElement, p: ElementProps, modes: Id[]) {
  const out: Record<string, unknown> = {
    id: el.id,
    type: el.type,
    name: el.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    w: Math.round(p.width),
    h: Math.round(p.height),
  }
  if (p.hidden) out.hidden = true
  if (p.text) out.text = short(p.text, 200)
  if (p.fill) out.fill = short(p.fill)
  if (p.stroke && p.strokeWidth) out.stroke = `${p.strokeWidth}px ${p.stroke}`
  if (el.type === 'text' || el.type === 'button' || el.type === 'input') {
    out.color = p.color
    out.font = `${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`
    if (p.textAlign !== 'left') out.align = p.textAlign
  }
  if (el.type === 'icon') {
    out.icon = p.icon
    out.color = p.color
  }
  if (p.radius) out.radius = p.radius
  if (p.opacity !== 1) out.opacity = p.opacity
  if (p.src) out.src = short(p.src, 80)
  if (p.fixed) out.fixed = true
  if (p.interaction) out.interaction = { action: p.interaction.action, target: p.interaction.target }
  const changedIn = modes.filter((m) => el.overrides[m] && Object.keys(el.overrides[m]).length)
  if (changedIn.length) out.changesInModes = changedIn
  return out
}

/** Convierte lo que manda el modelo en propiedades válidas (o explica qué falla). */
function cleanProps(raw: unknown, p: Project): Partial<ElementProps> {
  if (!raw || typeof raw !== 'object') throw new Error('`props` debe ser un objeto.')
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PROP_KEYS.has(key)) throw new Error(`La propiedad «${key}» no existe. Válidas: ${[...PROP_KEYS].join(', ')}.`)
    const base = (BASE_PROPS as unknown as Record<string, unknown>)[key]
    if (key === 'interaction') {
      out.interaction = cleanInteraction(value, p)
    } else if (typeof base === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) throw new Error(`«${key}» debe ser un número.`)
      out[key] = n
    } else if (typeof base === 'boolean') {
      out[key] = value === true || value === 'true'
    } else {
      out[key] = value === null || value === undefined ? '' : String(value)
    }
  }
  return out as Partial<ElementProps>
}

function cleanInteraction(value: unknown, p: Project): Interaction | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'object') throw new Error('`interaction` debe ser un objeto o null.')
  const v = value as Record<string, unknown>
  const action = String(v.action ?? 'navigate')
  if (!['navigate', 'overlay', 'back', 'close', 'url'].includes(action)) {
    throw new Error('`interaction.action` debe ser navigate, overlay, back, close o url.')
  }
  const target = v.target ? String(v.target) : null
  if ((action === 'navigate' || action === 'overlay') && (!target || !findScreen(p, target))) {
    throw new Error(`La pantalla destino «${String(target)}» no existe.`)
  }
  const transition = String(v.transition ?? 'dissolve') as Transition
  return {
    action: action as Interaction['action'],
    target: action === 'navigate' || action === 'overlay' ? target : null,
    transition: TRANSITIONS.includes(transition) ? transition : 'dissolve',
    url: action === 'url' ? String(v.url ?? '') : '',
  }
}

function applyProps(el: DesignElement, props: Partial<ElementProps>, modeId: Id | null) {
  for (const key of Object.keys(props) as PropKey[]) {
    if (modeId) setOverride(el, modeId, key, props[key])
    else (el.props as unknown as Record<string, unknown>)[key] = props[key]
  }
}

/** Un hueco libre a la derecha de una pantalla (o del lienzo) para una pantalla nueva. */
function freeSpot(p: Project, near: Screen | undefined, width: number, height: number) {
  const anchor = near ?? p.screens.reduce<Screen | undefined>((a, s) => (!a || s.x + s.width > a.x + a.width ? s : a), undefined)
  let x = anchor ? anchor.x + anchor.width + 160 : 0
  const y = anchor ? anchor.y : 0
  for (let i = 0; i < 200; i++) {
    const rect = { x, y, width, height }
    if (!p.screens.some((s) => intersects(screenRect(s), { x: rect.x - 80, y: rect.y, width: rect.width + 160, height: rect.height }))) break
    x += 200
  }
  return { x, y }
}

/* ---------- Herramientas ---------- */

const elementSpec = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: TYPES },
    name: { type: 'string' },
    props: { type: 'object', description: 'Propiedades de la capa (ver reglas). x/y relativas a la pantalla.' },
  },
  required: ['type', 'props'],
}

export const AI_TOOLS: AiTool[] = [
  {
    name: 'get_project',
    description:
      'Resumen del proyecto abierto: modos, modo activo, secciones y la lista de pantallas (id, nombre, tamaño, cantidad de capas). Úsala primero para conocer los ids.',
    inputSchema: { type: 'object', properties: {} },
    run() {
      const p = project()
      const st = getState()
      const sectionOf = (s: Screen) =>
        p.sections?.find((sec) => s.x >= sec.x && s.y >= sec.y && s.x + s.width <= sec.x + sec.width && s.y + s.height <= sec.y + sec.height)?.name
      return {
        name: p.name,
        kind: p.kind,
        activeMode: st.modeId,
        modes: p.modes.map((m) => ({ id: m.id, name: m.name })),
        startScreenId: p.startScreenId,
        screens: p.screens.map((s) => ({
          id: s.id,
          name: s.name,
          size: `${s.width}×${s.height}`,
          layers: s.elements.length,
          section: sectionOf(s),
          ...(s.excludedModes.length ? { missingInModes: s.excludedModes } : {}),
          ...(s.autoAdvance?.target ? { autoAdvanceTo: s.autoAdvance.target } : {}),
        })),
      }
    },
  },
  {
    name: 'get_screen',
    description: `Capas de una pantalla tal como se ven en un modo (de abajo hacia arriba), con posición, tamaño, texto, colores, fuente y a dónde lleva cada una. Devuelve hasta ${MAX_LIST} capas por llamada: usa offset para seguir o query para filtrar por nombre o texto.`,
    inputSchema: {
      type: 'object',
      properties: {
        screenId: { type: 'string' },
        modeId: { type: 'string', description: 'Modo a mostrar; por defecto el activo.' },
        query: { type: 'string', description: 'Solo capas cuyo nombre o texto contenga esto.' },
        offset: { type: 'number' },
      },
      required: ['screenId'],
    },
    run(input) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const modeId = modeOf(p, input.modeId)
      const q = typeof input.query === 'string' ? input.query.toLowerCase() : ''
      const all = s.elements.filter((el) => {
        if (!q) return true
        const pr = resolveProps(el, modeId)
        return el.name.toLowerCase().includes(q) || pr.text.toLowerCase().includes(q)
      })
      const offset = Math.max(0, Number(input.offset) || 0)
      const page = all.slice(offset, offset + MAX_LIST)
      const modes = p.modes.map((m) => m.id)
      return {
        id: s.id,
        name: s.name,
        width: s.width,
        height: s.height,
        fill: s.fill,
        mode: modeId,
        total: all.length,
        ...(offset + MAX_LIST < all.length ? { nextOffset: offset + MAX_LIST } : {}),
        layers: page.map((el) => describe(el, resolveProps(el, modeId), modes)),
      }
    },
  },
  {
    name: 'update_elements',
    description:
      'Cambia propiedades de capas de una pantalla. Con modeId, el cambio vale solo para ese modo (por ejemplo un plan); sin modeId cambia la base que comparten todos los modos.',
    inputSchema: {
      type: 'object',
      properties: {
        screenId: { type: 'string' },
        modeId: { type: 'string', description: 'Opcional: aplicar solo en este modo.' },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: { elementId: { type: 'string' }, name: { type: 'string' }, props: { type: 'object' } },
            required: ['elementId'],
          },
        },
      },
      required: ['screenId', 'updates'],
    },
    run(input, log) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const modeId = input.modeId ? modeOf(p, input.modeId) : null
      if (!Array.isArray(input.updates) || !input.updates.length) throw new Error('`updates` debe ser una lista no vacía.')
      const updates = input.updates.map((u: Record<string, unknown>) => {
        const el = s.elements.find((e) => e.id === u.elementId)
        if (!el) throw new Error(`No existe la capa «${String(u.elementId)}» en «${s.name}».`)
        return { id: el.id, name: typeof u.name === 'string' ? u.name : undefined, props: u.props ? cleanProps(u.props, p) : {} }
      })
      mutate((d) => {
        const ds = d.screens.find((x) => x.id === s.id)!
        for (const u of updates) {
          const el = ds.elements.find((e) => e.id === u.id) as DesignElement
          applyProps(el, u.props, modeId)
          if (u.name) el.name = u.name
        }
      })
      const where = modeId ? ` (solo en ${p.modes.find((m) => m.id === modeId)?.name})` : ''
      log(`Editó ${updates.length} ${updates.length === 1 ? 'capa' : 'capas'} en «${s.name}»${where}`)
      return { updated: updates.length }
    },
  },
  {
    name: 'add_elements',
    description:
      'Agrega capas a una pantalla (encima de las existentes). Con modeId, las capas solo se ven en ese modo. Devuelve los ids nuevos.',
    inputSchema: {
      type: 'object',
      properties: {
        screenId: { type: 'string' },
        modeId: { type: 'string', description: 'Opcional: que solo existan en este modo.' },
        elements: { type: 'array', items: elementSpec },
      },
      required: ['screenId', 'elements'],
    },
    run(input, log) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const modeId = input.modeId ? modeOf(p, input.modeId) : null
      if (!Array.isArray(input.elements) || !input.elements.length) throw new Error('`elements` debe ser una lista no vacía.')
      const created = input.elements.map((raw: Record<string, unknown>) => {
        const type = String(raw.type) as ElementType
        if (!TYPES.includes(type)) throw new Error(`Tipo de capa desconocido «${String(raw.type)}». Tipos: ${TYPES.join(', ')}.`)
        const el = createElement(type, cleanProps(raw.props ?? {}, p), typeof raw.name === 'string' ? raw.name : undefined)
        if (modeId) {
          el.props.hidden = true
          el.overrides[modeId] = { hidden: false }
        }
        return el
      })
      mutate((d) => {
        d.screens.find((x) => x.id === s.id)!.elements.push(...created)
      })
      log(`Agregó ${created.length} ${created.length === 1 ? 'capa' : 'capas'} en «${s.name}»`)
      return { ids: created.map((e) => e.id) }
    },
  },
  {
    name: 'delete_elements',
    description: 'Borra capas de una pantalla.',
    inputSchema: {
      type: 'object',
      properties: { screenId: { type: 'string' }, elementIds: { type: 'array', items: { type: 'string' } } },
      required: ['screenId', 'elementIds'],
    },
    run(input, log) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const ids = new Set((Array.isArray(input.elementIds) ? input.elementIds : []).map(String))
      const found = s.elements.filter((e) => ids.has(e.id)).length
      if (!found) throw new Error('Ninguno de esos ids es una capa de esta pantalla.')
      mutate((d) => {
        const ds = d.screens.find((x) => x.id === s.id)!
        ds.elements = ds.elements.filter((e) => !ids.has(e.id))
      })
      if (getState().selection.kind === 'elements') select({ kind: 'none' })
      log(`Borró ${found} ${found === 1 ? 'capa' : 'capas'} de «${s.name}»`)
      return { deleted: found }
    },
  },
  {
    name: 'add_screen',
    description:
      'Crea una pantalla nueva, opcionalmente con capas, junto a otra pantalla (nearScreenId) o al final del lienzo. Devuelve su id y los de sus capas.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        fill: { type: 'string' },
        nearScreenId: { type: 'string' },
        elements: { type: 'array', items: elementSpec },
      },
      required: ['name'],
    },
    run(input, log) {
      const p = project()
      const near = input.nearScreenId ? screenOf(p, input.nearScreenId) : undefined
      const ref = near ?? p.screens[0]
      const width = Number(input.width) || ref?.width || 390
      const height = Number(input.height) || ref?.height || 844
      const { x, y } = freeSpot(p, near, width, height)
      const screen = createScreen(String(input.name || 'Pantalla nueva'), x, y, width, height)
      if (typeof input.fill === 'string') screen.fill = input.fill
      else if (ref) screen.fill = ref.fill
      if (Array.isArray(input.elements)) {
        for (const raw of input.elements as Record<string, unknown>[]) {
          const type = String(raw.type) as ElementType
          if (!TYPES.includes(type)) throw new Error(`Tipo de capa desconocido «${String(raw.type)}».`)
          screen.elements.push(createElement(type, cleanProps(raw.props ?? {}, p), typeof raw.name === 'string' ? raw.name : undefined))
        }
      }
      mutate((d) => {
        d.screens.push(screen)
      })
      log(`Creó la pantalla «${screen.name}»`)
      return { id: screen.id, layerIds: screen.elements.map((e) => e.id) }
    },
  },
  {
    name: 'update_screen',
    description:
      'Cambia una pantalla: nombre, fondo, tamaño, en qué modos no existe (missingInModes), avance automático a otra pantalla, o la marca como pantalla de inicio.',
    inputSchema: {
      type: 'object',
      properties: {
        screenId: { type: 'string' },
        name: { type: 'string' },
        fill: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        missingInModes: { type: 'array', items: { type: 'string' } },
        autoAdvance: {
          type: ['object', 'null'],
          properties: { target: { type: 'string' }, delay: { type: 'number' } },
        },
        isStart: { type: 'boolean' },
      },
      required: ['screenId'],
    },
    run(input, log) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const excluded = Array.isArray(input.missingInModes) ? input.missingInModes.map((m) => modeOf(p, m)) : null
      let auto: Screen['autoAdvance'] | undefined
      if (input.autoAdvance === null) auto = null
      else if (input.autoAdvance && typeof input.autoAdvance === 'object') {
        const a = input.autoAdvance as Record<string, unknown>
        screenOf(p, a.target)
        auto = { target: String(a.target), delay: Number(a.delay) || 2500, transition: 'dissolve' }
      }
      mutate((d) => {
        const ds = d.screens.find((x) => x.id === s.id)!
        if (typeof input.name === 'string' && input.name.trim()) ds.name = input.name.trim()
        if (typeof input.fill === 'string') ds.fill = input.fill
        if (Number(input.width) > 0) ds.width = Number(input.width)
        if (Number(input.height) > 0) ds.height = Number(input.height)
        if (excluded) ds.excludedModes = excluded
        if (auto !== undefined) ds.autoAdvance = auto
        if (input.isStart === true) d.startScreenId = s.id
      })
      log(`Cambió la pantalla «${s.name}»`)
      return { ok: true }
    },
  },
  {
    name: 'add_mode',
    description:
      'Crea un modo nuevo (plan, rol, idioma…). Con copyFrom copia los cambios de otro modo como punto de partida. Devuelve su id.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, copyFrom: { type: 'string' } },
      required: ['name'],
    },
    run(input, log) {
      const p = project()
      const from = input.copyFrom ? modeOf(p, input.copyFrom) : undefined
      addMode(String(input.name || 'Modo nuevo'), from)
      const mode = project().modes.at(-1)!
      log(`Creó el modo «${mode.name}»`)
      return { id: mode.id }
    },
  },
  {
    name: 'show',
    description:
      'Selecciona y encuadra en el lienzo una pantalla o algunas de sus capas, para que la persona vea lo que hiciste o de qué hablás.',
    inputSchema: {
      type: 'object',
      properties: { screenId: { type: 'string' }, elementIds: { type: 'array', items: { type: 'string' } } },
      required: ['screenId'],
    },
    run(input) {
      const p = project()
      const s = screenOf(p, input.screenId)
      const ids = (Array.isArray(input.elementIds) ? input.elementIds.map(String) : []).filter((id) =>
        s.elements.some((e) => e.id === id),
      )
      if (getState().player) setState({ player: null })
      if (ids.length) {
        select({ kind: 'elements', screenId: s.id, ids })
        zoomToSelection()
      } else {
        select({ kind: 'screens', ids: [s.id] })
        zoomToRect(screenRect(s))
      }
      return { ok: true }
    },
  },
]

/** Lo que la persona tiene delante: se añade a cada mensaje para que el asistente sepa de qué habla. */
export function contextNote(): string {
  const p = currentProject()
  if (!p) return ''
  const st = getState()
  const mode = p.modes.find((m) => m.id === st.modeId)
  const parts = [
    `Proyecto «${p.name}» (${p.kind === 'app' ? 'app' : 'web'}, ${p.screens.length} pantallas).`,
    `Modo activo: «${mode?.name}» (${mode?.id}). Modos: ${p.modes.map((m) => `${m.name} (${m.id})`).join(', ')}.`,
  ]
  const sel = st.selection
  if (sel.kind === 'screens' && sel.ids.length) {
    const names = sel.ids.map((id) => findScreen(p, id)).filter(Boolean).map((s) => `«${s!.name}» (${s!.id})`)
    parts.push(`Seleccionado: pantalla ${names.join(', ')}.`)
  } else if (sel.kind === 'elements') {
    const s = findScreen(p, sel.screenId)
    if (s) {
      const els = sel.ids
        .map((id) => s.elements.find((e) => e.id === id))
        .filter(Boolean)
        .slice(0, 12)
        .map((e) => `«${e!.name}» (${e!.id})`)
      parts.push(`Seleccionado en la pantalla «${s.name}» (${s.id}): ${els.join(', ')}.`)
    }
  } else {
    parts.push('No hay nada seleccionado.')
  }
  return parts.join(' ')
}
