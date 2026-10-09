import { isScreenAvailable, resolveProps } from './modes'
import type { Id, Interaction, InteractionAction, Project, Screen } from './types'

export interface FlowEdge {
  id: string
  fromScreenId: Id
  /** Vacío cuando el flujo sale de la propia pantalla (avance automático). */
  fromElementId: Id
  toScreenId: Id
  action: InteractionAction | 'auto'
  /** El destino no existe en el modo activo. */
  broken: boolean
}

type RawEdge = Omit<FlowEdge, 'broken'>

// Las pantallas son inmutables: sus salidas por modo se calculan una vez por objeto,
// y el resultado completo una vez por lista de pantallas. Al arrastrar algo solo se
// recalcula la pantalla que cambió.
const screenEdges = new WeakMap<Screen, Map<Id, RawEdge[]>>()
const projectEdges = new WeakMap<Screen[], Map<Id, FlowEdge[]>>()

function edgesFrom(screen: Screen, modeId: Id): RawEdge[] {
  let byMode = screenEdges.get(screen)
  if (!byMode) screenEdges.set(screen, (byMode = new Map()))
  const cached = byMode.get(modeId)
  if (cached) return cached
  const out: RawEdge[] = []
  const auto = screen.autoAdvance
  if (auto?.target) {
    out.push({ id: `${screen.id}:auto`, fromScreenId: screen.id, fromElementId: '', toScreenId: auto.target, action: 'auto' })
  }
  for (const el of screen.elements) {
    const p = resolveProps(el, modeId)
    if (p.hidden || !p.interaction) continue
    const { action, target } = p.interaction
    if ((action !== 'navigate' && action !== 'overlay') || !target) continue
    out.push({ id: `${screen.id}:${el.id}`, fromScreenId: screen.id, fromElementId: el.id, toScreenId: target, action })
  }
  byMode.set(modeId, out)
  return out
}

/** Conexiones entre pantallas tal y como se comportan en un modo. */
export function computeFlows(project: Project, modeId: Id): FlowEdge[] {
  let byMode = projectEdges.get(project.screens)
  if (!byMode) projectEdges.set(project.screens, (byMode = new Map()))
  const cached = byMode.get(modeId)
  if (cached) return cached
  const byId = new Map(project.screens.map((s) => [s.id, s]))
  const edges: FlowEdge[] = []
  for (const screen of project.screens) {
    if (!isScreenAvailable(screen, modeId)) continue
    for (const e of edgesFrom(screen, modeId)) {
      const dest = byId.get(e.toScreenId)
      edges.push({ ...e, broken: !dest || !isScreenAvailable(dest, modeId) })
    }
  }
  byMode.set(modeId, edges)
  return edges
}

/* ---------- Navegación del prototipo ---------- */

export interface PlayerNav {
  /** Pila de pantallas visitadas; la última es la actual. */
  stack: Id[]
  /** Pantalla abierta como modal encima de la actual. */
  overlay: Id | null
}

export function startNav(screenId: Id): PlayerNav {
  return { stack: [screenId], overlay: null }
}

export function currentScreenId(nav: PlayerNav): Id {
  return nav.stack[nav.stack.length - 1]
}

/** Aplica una interacción. Devuelve el mismo estado si no hay cambio. */
export function applyInteraction(
  nav: PlayerNav,
  interaction: Interaction,
  screens: Screen[],
  modeId: Id,
): PlayerNav {
  const exists = (id: Id | null) => {
    const s = id ? screens.find((x) => x.id === id) : undefined
    return !!s && isScreenAvailable(s, modeId)
  }
  switch (interaction.action) {
    case 'navigate':
      if (!exists(interaction.target)) return nav
      return { stack: [...nav.stack, interaction.target!], overlay: null }
    case 'overlay':
      if (!exists(interaction.target)) return nav
      return { ...nav, overlay: interaction.target }
    case 'close':
      return nav.overlay ? { ...nav, overlay: null } : nav
    case 'back':
      if (nav.overlay) return { ...nav, overlay: null }
      if (nav.stack.length <= 1) return nav
      return { stack: nav.stack.slice(0, -1), overlay: null }
    case 'url':
      return nav
  }
}

export function goBack(nav: PlayerNav): PlayerNav {
  return applyInteraction(
    nav,
    { action: 'back', target: null, transition: 'instant', url: '' },
    [],
    '',
  )
}
