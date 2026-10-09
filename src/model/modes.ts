import type {
  DesignElement,
  ElementProps,
  Id,
  Project,
  PropKey,
  Screen,
} from './types'

/** Propiedades efectivas de un elemento en un modo: base + cambios del modo. */
// Los elementos son inmutables: el resultado por modo se guarda mientras viva el objeto.
// Así un elemento con cambios en un modo no se vuelve a dibujar si nada cambió.
const resolved = new WeakMap<DesignElement, Map<Id, ElementProps>>()

export function resolveProps(el: DesignElement, modeId: Id): ElementProps {
  const ov = el.overrides[modeId]
  if (!ov) return el.props
  let byMode = resolved.get(el)
  if (!byMode) resolved.set(el, (byMode = new Map()))
  let p = byMode.get(modeId)
  if (!p) byMode.set(modeId, (p = { ...el.props, ...ov }))
  return p
}

export function isScreenAvailable(screen: Screen, modeId: Id): boolean {
  return !screen.excludedModes.includes(modeId)
}

export function overriddenKeys(el: DesignElement, modeId: Id): PropKey[] {
  const ov = el.overrides[modeId]
  return ov ? (Object.keys(ov) as PropKey[]) : []
}

export function isOverridden(el: DesignElement, modeId: Id, key: PropKey): boolean {
  const ov = el.overrides[modeId]
  return !!ov && key in ov
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

export type EditScope = 'all' | 'mode'

/**
 * Escribe propiedades respetando los modos:
 * - si el modo activo ya sobrescribe la propiedad, se edita ese cambio
 *   (lo que ves es lo que editas);
 * - si el alcance es «solo este modo», se crea un cambio para el modo;
 * - si no, se edita la base compartida por todos los modos.
 */
export function writeProps(
  el: DesignElement,
  patch: Partial<ElementProps>,
  modeId: Id,
  scope: EditScope,
): void {
  for (const key of Object.keys(patch) as PropKey[]) {
    const value = patch[key]
    const ov = el.overrides[modeId]
    if (ov && key in ov) {
      setOverride(el, modeId, key, value)
    } else if (scope === 'mode') {
      setOverride(el, modeId, key, value)
    } else {
      ;(el.props as unknown as Record<string, unknown>)[key] = value
    }
  }
}

/** Fija (o elimina si coincide con la base) el valor de una propiedad en un modo. */
export function setOverride(
  el: DesignElement,
  modeId: Id,
  key: PropKey,
  value: unknown,
): void {
  if (sameValue(el.props[key], value)) {
    clearOverride(el, modeId, [key])
    return
  }
  const ov = (el.overrides[modeId] ??= {}) as Record<string, unknown>
  ov[key] = value
}

export function clearOverride(el: DesignElement, modeId: Id, keys?: PropKey[]): void {
  const ov = el.overrides[modeId]
  if (!ov) return
  if (!keys) {
    delete el.overrides[modeId]
    return
  }
  for (const k of keys) delete (ov as Record<string, unknown>)[k]
  if (Object.keys(ov).length === 0) delete el.overrides[modeId]
}

/**
 * Activa o desactiva la visibilidad de un elemento en un modo concreto.
 * Si todos los modos acaban con el mismo valor, se consolida en la base.
 */
export function setVisibleInMode(
  el: DesignElement,
  modeId: Id,
  visible: boolean,
  allModeIds: Id[],
): void {
  setOverride(el, modeId, 'hidden', !visible)
  const values = allModeIds.map((m) => resolveProps(el, m).hidden)
  if (values.length > 0 && values.every((v) => v === values[0])) {
    el.props.hidden = values[0]
    for (const m of allModeIds) clearOverride(el, m, ['hidden'])
  }
}

/** Cuántos elementos de la pantalla cambian en un modo (para marcar en el canvas). */
export function screenChangesInMode(screen: Screen, modeId: Id): number {
  let n = 0
  for (const el of screen.elements) if (el.overrides[modeId]) n++
  return n
}

/** Diferencias de un elemento entre un modo y la base, en texto legible. */
export function describeOverrides(el: DesignElement, modeId: Id): string[] {
  return overriddenKeys(el, modeId).map((k) => PROP_LABELS[k] ?? k)
}

export const PROP_LABELS: Partial<Record<PropKey, string>> = {
  x: 'Posición X',
  y: 'Posición Y',
  width: 'Ancho',
  height: 'Alto',
  hidden: 'Visibilidad',
  opacity: 'Opacidad',
  fill: 'Relleno',
  stroke: 'Borde',
  strokeWidth: 'Grosor de borde',
  radius: 'Radio',
  shadow: 'Sombra',
  text: 'Texto',
  color: 'Color de texto',
  fontFamily: 'Fuente',
  fontSize: 'Tamaño de fuente',
  fontWeight: 'Peso',
  lineHeight: 'Interlineado',
  letterSpacing: 'Espaciado',
  italic: 'Cursiva',
  nowrap: 'Sin salto de línea',
  blur: 'Desenfoque',
  mask: 'Máscara',
  filter: 'Filtros',
  blend: 'Fusión',
  textAlign: 'Alineación',
  src: 'Imagen',
  fit: 'Ajuste',
  icon: 'Icono',
  fixed: 'Fijo',
  interaction: 'Interacción',
}

/** Elimina un modo y todos sus cambios. */
export function removeModeFromProject(project: Project, modeId: Id): void {
  project.modes = project.modes.filter((m) => m.id !== modeId)
  for (const s of project.screens) {
    s.excludedModes = s.excludedModes.filter((m) => m !== modeId)
    for (const el of s.elements) delete el.overrides[modeId]
  }
}

/** Copia los cambios de un modo existente a uno nuevo. */
export function copyModeOverrides(project: Project, fromId: Id, toId: Id): void {
  for (const s of project.screens) {
    if (s.excludedModes.includes(fromId)) s.excludedModes.push(toId)
    for (const el of s.elements) {
      const ov = el.overrides[fromId]
      if (ov) el.overrides[toId] = JSON.parse(JSON.stringify(ov)) as typeof ov
    }
  }
}
