import type { Rect } from './types'

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.03
export const MAX_ZOOM = 8

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function worldToScreen(cam: Camera, x: number, y: number) {
  return { x: x * cam.zoom + cam.x, y: y * cam.zoom + cam.y }
}

export function screenToWorld(cam: Camera, x: number, y: number) {
  return { x: (x - cam.x) / cam.zoom, y: (y - cam.y) / cam.zoom }
}

/** Zoom manteniendo fijo el punto (px, py) de la pantalla. */
export function zoomAt(cam: Camera, px: number, py: number, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom)
  const w = screenToWorld(cam, px, py)
  return { zoom, x: px - w.x * zoom, y: py - w.y * zoom }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.width)
    y2 = Math.max(y2, r.y + r.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  )
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Cámara que encuadra un rectángulo del mundo dentro del viewport. */
export function fitCamera(
  rect: Rect,
  viewW: number,
  viewH: number,
  padding = 80,
  maxZoom = 1,
): Camera {
  const zoom = clampZoom(
    Math.min(
      maxZoom,
      (viewW - padding * 2) / Math.max(rect.width, 1),
      (viewH - padding * 2) / Math.max(rect.height, 1),
    ),
  )
  return {
    zoom,
    x: viewW / 2 - (rect.x + rect.width / 2) * zoom,
    y: viewH / 2 - (rect.y + rect.height / 2) * zoom,
  }
}

/* ---------- Ajuste magnético (snapping) ---------- */

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Posición de la guía en coordenadas del mundo. */
  value: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

function edges(start: number, size: number): number[] {
  return [start, start + size / 2, start + size]
}

function bestSnap(values: number[], targets: number[], threshold: number) {
  let best: { delta: number; value: number } | null = null
  for (const v of values) {
    for (const t of targets) {
      const d = t - v
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, value: t }
      }
    }
  }
  return best
}

/**
 * Ajusta un rectángulo en movimiento a los bordes y centros de los
 * rectángulos de referencia.
 */
export function snapRect(moving: Rect, refs: Rect[], threshold: number): SnapResult {
  const xs: number[] = []
  const ys: number[] = []
  for (const r of refs) {
    xs.push(...edges(r.x, r.width))
    ys.push(...edges(r.y, r.height))
  }
  const sx = bestSnap(edges(moving.x, moving.width), xs, threshold)
  const sy = bestSnap(edges(moving.y, moving.height), ys, threshold)
  const guides: SnapGuide[] = []
  if (sx) guides.push({ axis: 'x', value: sx.value })
  if (sy) guides.push({ axis: 'y', value: sy.value })
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides }
}

/** Ajusta un único valor (un borde durante un redimensionado). */
export function snapValue(value: number, targets: number[], threshold: number) {
  return bestSnap([value], targets, threshold)
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Nuevo rectángulo al arrastrar un tirador de redimensionado. */
export function resizeRect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio: boolean,
  minSize = 1,
): Rect {
  let { x, y, width, height } = start
  const right = start.x + start.width
  const bottom = start.y + start.height
  if (handle.includes('w')) {
    x = Math.min(start.x + dx, right - minSize)
    width = right - x
  }
  if (handle.includes('e')) width = Math.max(minSize, start.width + dx)
  if (handle.includes('n')) {
    y = Math.min(start.y + dy, bottom - minSize)
    height = bottom - y
  }
  if (handle.includes('s')) height = Math.max(minSize, start.height + dy)

  if (keepRatio && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height
    const horizontal = handle === 'e' || handle === 'w'
    const vertical = handle === 'n' || handle === 's'
    if (horizontal) height = width / ratio
    else if (vertical) width = height * ratio
    else if (width / height > ratio) height = width / ratio
    else width = height * ratio
    if (handle.includes('w')) x = right - width
    if (handle.includes('n')) y = bottom - height
  }
  return { x, y, width, height }
}

export function roundRect(r: Rect): Rect {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.max(1, Math.round(r.width)),
    height: Math.max(1, Math.round(r.height)),
  }
}
