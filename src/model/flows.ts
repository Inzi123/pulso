import { isScreenAvailable, resolveProps } from './modes'
import type { Id, Interaction, InteractionAction, Project, Screen } from './types'

export interface FlowEdge {
  id: string
  fromScreenId: Id
  fromElementId: Id
  toScreenId: Id
  action: InteractionAction
  /** El destino no existe en el modo activo. */
  broken: boolean
}

/** Conexiones entre pantallas tal y como se comportan en un modo. */
export function computeFlows(project: Project, modeId: Id): FlowEdge[] {
  const byId = new Map(project.screens.map((s) => [s.id, s]))
  const edges: FlowEdge[] = []
  for (const screen of project.screens) {
    if (!isScreenAvailable(screen, modeId)) continue
    for (const el of screen.elements) {
      const p = resolveProps(el, modeId)
      if (p.hidden || !p.interaction) continue
      const { action, target } = p.interaction
      if ((action !== 'navigate' && action !== 'overlay') || !target) continue
      const dest = byId.get(target)
      edges.push({
        id: `${screen.id}:${el.id}`,
        fromScreenId: screen.id,
        fromElementId: el.id,
        toScreenId: target,
        action,
        broken: !dest || !isScreenAvailable(dest, modeId),
      })
    }
  }
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
