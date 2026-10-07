import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BASE_PROPS } from '../model/defaults'
import { computeFlows } from '../model/flows'
import {
  containsPoint,
  intersects,
  normalizeRect,
  resizeRect,
  roundRect,
  screenToWorld,
  snapRect,
  snapValue,
  unionRects,
  worldToScreen,
  zoomAt,
  type Camera,
  type Handle,
  type SnapGuide,
} from '../model/geometry'
import { resolveProps } from '../model/modes'
import { elementWorldRect, findScreen, screenRect } from '../model/project'
import type { ElementProps, ElementType, Id, Project, Rect } from '../model/types'
import { Menu, MOD, type MenuEntry } from '../ui/controls'
import {
  DRAW_TOOLS,
  NO_SELECTION,
  addElement,
  addScreen,
  beginGesture,
  copySelection,
  deleteSelection,
  duplicateInPlace,
  duplicateSelection,
  endGesture,
  getState,
  moveElementsToScreen,
  mutate,
  paste,
  play,
  reorderSelection,
  select,
  setCamera,
  setStartScreen,
  setState,
  setTool,
  toast,
  updateElements,
  updateScreen,
  useStore,
  type Selection,
} from '../store/store'
import {
  FlowLayer,
  FlowMarkers,
  Guides,
  HoverOutline,
  ScreenLabels,
  ScreenView,
  SelectionOverlay,
} from './CanvasLayers'

type Drag =
  | { type: 'pan'; sx: number; sy: number; cam: Camera }
  | {
      type: 'marquee'
      start: { x: number; y: number }
      screenId: Id | null
      additive: boolean
      base: Selection
    }
  | {
      type: 'move-elements'
      screenId: Id
      ids: Id[]
      start: { x: number; y: number }
      starts: Map<Id, { x: number; y: number }>
      box: Rect
      refs: Rect[]
      moved: boolean
      clickedId: Id
      wasSelected: boolean
    }
  | {
      type: 'move-screens'
      ids: Id[]
      start: { x: number; y: number }
      starts: Map<Id, { x: number; y: number }>
      box: Rect
      refs: Rect[]
      moved: boolean
      clickedId: Id
      wasSelected: boolean
    }
  | {
      type: 'resize'
      target: { kind: 'screen'; id: Id } | { kind: 'element'; screenId: Id; id: Id }
      handle: Handle
      start: { x: number; y: number }
      rect: Rect
      xs: number[]
      ys: number[]
    }
  | { type: 'draw'; tool: string; start: { x: number; y: number }; screenId: Id | null }
  | { type: 'connect'; screenId: Id; elementId: Id; from: Rect }

interface Overlay {
  marquee?: Rect
  draw?: Rect
  connect?: { from: Rect; to: { x: number; y: number }; target: Id | null }
  guides?: SnapGuide[]
  guideSpan?: Rect | null
  dropScreenId?: Id | null
}

type Hover = { kind: 'screen'; id: Id } | { kind: 'element'; screenId: Id; id: Id } | null

const DRAG_THRESHOLD = 3

function isTextType(t: ElementType) {
  return t === 'text' || t === 'button' || t === 'input'
}

export function Canvas() {
  const project = useStore((s) => (s.openId ? s.projects[s.openId] : null)) as Project
  const camera = useStore((s) => s.camera)
  const modeId = useStore((s) => s.modeId)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const showFlows = useStore((s) => s.showFlows)
  const editingTextId = useStore((s) => s.editingTextId)
  const scope = useStore((s) => s.scope)
  const mode = project.modes.find((m) => m.id === modeId)

  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; cx: number; cy: number; cam: Camera } | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({})
  const [hover, setHover] = useState<Hover>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [liftedScreenId, setLiftedScreenId] = useState<Id | null>(null)
  const [renamingId, setRenamingId] = useState<Id | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null)

  /* ----- Tamaño del viewport ----- */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setState({ viewport: { w: el.clientWidth, h: el.clientHeight } })
    })
    ro.observe(el)
    setState({ viewport: { w: el.clientWidth, h: el.clientHeight } })
    return () => ro.disconnect()
  }, [])

  /* ----- Rueda / trackpad ----- */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.menu')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cam = getState().camera
      if (e.ctrlKey || e.metaKey) {
        const unit = e.deltaMode === 1 ? 16 : 1
        const delta = Math.max(-60, Math.min(60, e.deltaY * unit))
        setCamera(zoomAt(cam, e.clientX - r.left, e.clientY - r.top, cam.zoom * Math.pow(2, -delta / 120)))
      } else {
        const unit = e.deltaMode === 1 ? 16 : 1
        let dx = e.deltaX * unit
        let dy = e.deltaY * unit
        if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0]
        setCamera({ ...cam, x: cam.x - dx, y: cam.y - dy })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ----- Barra espaciadora para desplazar ----- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return
      e.preventDefault()
      setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect()
    return screenToWorld(getState().camera, clientX - r.left, clientY - r.top)
  }, [])

  const screenAt = useCallback(
    (x: number, y: number, exclude?: Id): Id | null => {
      const p = currentProjectFresh()
      for (let i = p.screens.length - 1; i >= 0; i--) {
        const s = p.screens[i]
        if (s.id !== exclude && containsPoint(screenRect(s), x, y)) return s.id
      }
      return null
    },
    [],
  )

  /* ----- Puntero ----- */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-editing]') || target.closest('.menu') || target.closest('.label-rename')) return
    if (getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur?.()
    setMenu(null)

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // Pellizco con dos dedos: zoom y desplazamiento.
      cancelDrag()
      const [a, b] = [...pointers.current.values()]
      const r = viewportRef.current!.getBoundingClientRect()
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
        cam: getState().camera,
      }
      return
    }
    if (e.button === 2) return
    viewportRef.current?.setPointerCapture(e.pointerId)

    const world = toWorld(e.clientX, e.clientY)
    const state = getState()
    const p = currentProjectFresh()

    if (e.button === 1 || spaceDown || state.tool === 'hand') {
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: state.camera }
      setPanning(true)
      return
    }

    // Herramientas de dibujo
    if (state.tool === 'screen' || DRAW_TOOLS[state.tool]) {
      const screenId = state.tool === 'screen' ? null : screenAt(world.x, world.y)
      if (state.tool !== 'screen' && !screenId) {
        toast('Dibuja dentro de una pantalla. Usa la herramienta Pantalla (F) para crear una nueva.')
        return
      }
      drag.current = { type: 'draw', tool: state.tool, start: world, screenId }
      setOverlay({ draw: { x: world.x, y: world.y, width: 0, height: 0 } })
      return
    }

    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    if (handle) {
      startResize(handle, world)
      return
    }

    if (target.closest('[data-connector]') && state.selection.kind === 'elements' && state.selection.ids.length === 1) {
      const screen = findScreen(p, state.selection.screenId)
      const el = screen?.elements.find((x) => x.id === (state.selection as { ids: Id[] }).ids[0])
      if (screen && el) {
        drag.current = { type: 'connect', screenId: screen.id, elementId: el.id, from: elementWorldRect(screen, el, state.modeId) }
        setOverlay({ connect: { from: elementWorldRect(screen, el, state.modeId), to: world, target: null } })
      }
      return
    }

    const labelId = target.closest<HTMLElement>('[data-screen-label]')?.dataset.screenLabel
    const elId = target.closest<HTMLElement>('[data-el]')?.dataset.el
    const screenId = target.closest<HTMLElement>('[data-screen]')?.dataset.screen
    const mod = e.metaKey || e.ctrlKey

    if (elId && screenId && !mod) {
      startElementDrag(screenId, elId, world, e.shiftKey, e.altKey)
      return
    }
    if (screenId && mod) {
      // Selección por área dentro de la pantalla.
      drag.current = { type: 'marquee', start: world, screenId, additive: e.shiftKey, base: state.selection }
      return
    }
    const sid = labelId ?? screenId
    if (sid) {
      startScreenDrag(sid, world, e.shiftKey, e.altKey)
      return
    }
    // Lienzo vacío: con el dedo se desplaza; con ratón, selección por área.
    if (e.pointerType === 'touch') {
      select(NO_SELECTION)
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: state.camera }
      setPanning(true)
      return
    }
    if (!e.shiftKey) select(NO_SELECTION)
    drag.current = { type: 'marquee', start: world, screenId: null, additive: e.shiftKey, base: state.selection }
  }

  function startResize(handle: Handle, world: { x: number; y: number }) {
    const state = getState()
    const p = currentProjectFresh()
    const sel = state.selection
    beginGesture()
    if (sel.kind === 'screens' && sel.ids.length === 1) {
      const s = findScreen(p, sel.ids[0])!
      const others = p.screens.filter((x) => x.id !== s.id)
      drag.current = {
        type: 'resize',
        target: { kind: 'screen', id: s.id },
        handle,
        start: world,
        rect: screenRect(s),
        xs: others.flatMap((o) => [o.x, o.x + o.width]),
        ys: others.flatMap((o) => [o.y, o.y + o.height]),
      }
    } else if (sel.kind === 'elements' && sel.ids.length === 1) {
      const s = findScreen(p, sel.screenId)!
      const el = s.elements.find((x) => x.id === sel.ids[0])!
      const r = resolveProps(el, state.modeId)
      const refs = siblingRects(p, s.id, [el.id], state.modeId)
      drag.current = {
        type: 'resize',
        target: { kind: 'element', screenId: s.id, id: el.id },
        handle,
        start: world,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        xs: refs.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]),
        ys: refs.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]),
      }
    }
  }

  function startElementDrag(screenId: Id, elId: Id, world: { x: number; y: number }, shift: boolean, alt: boolean) {
    const state = getState()
    let sel = state.selection
    const wasSelected = sel.kind === 'elements' && sel.screenId === screenId && sel.ids.includes(elId)
    if (shift) {
      const ids = sel.kind === 'elements' && sel.screenId === screenId ? sel.ids : []
      const next = ids.includes(elId) ? ids.filter((x) => x !== elId) : [...ids, elId]
      sel = next.length ? { kind: 'elements', screenId, ids: next } : NO_SELECTION
      select(sel)
      if (!next.includes(elId)) return
    } else if (!wasSelected) {
      sel = { kind: 'elements', screenId, ids: [elId] }
      select(sel)
    }
    if (sel.kind !== 'elements') return
    beginGesture()
    if (alt) sel = duplicateInPlace()
    if (sel.kind !== 'elements') return
    const p = currentProjectFresh()
    const screen = findScreen(p, screenId)!
    const starts = new Map<Id, { x: number; y: number }>()
    const rects: Rect[] = []
    for (const el of screen.elements) {
      if (!sel.ids.includes(el.id)) continue
      const r = resolveProps(el, state.modeId)
      starts.set(el.id, { x: r.x, y: r.y })
      rects.push({ x: r.x, y: r.y, width: r.width, height: r.height })
    }
    drag.current = {
      type: 'move-elements',
      screenId,
      ids: sel.ids,
      start: world,
      starts,
      box: unionRects(rects)!,
      refs: siblingRects(p, screenId, sel.ids, state.modeId),
      moved: false,
      clickedId: elId,
      wasSelected: wasSelected && !shift,
    }
  }

  function startScreenDrag(screenId: Id, world: { x: number; y: number }, shift: boolean, alt: boolean) {
    const state = getState()
    let sel = state.selection
    const wasSelected = sel.kind === 'screens' && sel.ids.includes(screenId)
    if (shift) {
      const ids = sel.kind === 'screens' ? sel.ids : []
      const next = ids.includes(screenId) ? ids.filter((x) => x !== screenId) : [...ids, screenId]
      sel = next.length ? { kind: 'screens', ids: next } : NO_SELECTION
      select(sel)
      if (!next.includes(screenId)) return
    } else if (!wasSelected) {
      sel = { kind: 'screens', ids: [screenId] }
      select(sel)
    }
    if (sel.kind !== 'screens') return
    beginGesture()
    if (alt) sel = duplicateInPlace()
    if (sel.kind !== 'screens') return
    const p = currentProjectFresh()
    const ids = sel.ids
    const moving = p.screens.filter((s) => ids.includes(s.id))
    drag.current = {
      type: 'move-screens',
      ids,
      start: world,
      starts: new Map(moving.map((s) => [s.id, { x: s.x, y: s.y }])),
      box: unionRects(moving.map(screenRect))!,
      refs: p.screens.filter((s) => !ids.includes(s.id)).map(screenRect),
      moved: false,
      clickedId: screenId,
      wasSelected: wasSelected && !shift,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const r = viewportRef.current!.getBoundingClientRect()
      const pc = pinch.current
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      const zoomed = zoomAt(pc.cam, pc.cx, pc.cy, (pc.cam.zoom * dist) / Math.max(pc.dist, 1))
      setCamera({ ...zoomed, x: zoomed.x + cx - pc.cx, y: zoomed.y + cy - pc.cy })
      return
    }

    const d = drag.current
    if (!d) {
      updateHover(e)
      return
    }
    const state = getState()
    const zoom = state.camera.zoom
    const world = toWorld(e.clientX, e.clientY)
    const threshold = 6 / zoom

    switch (d.type) {
      case 'pan':
        setCamera({ ...d.cam, x: d.cam.x + e.clientX - d.sx, y: d.cam.y + e.clientY - d.sy })
        break

      case 'marquee': {
        const rect = normalizeRect(d.start.x, d.start.y, world.x, world.y)
        setOverlay({ marquee: rect })
        const p = currentProjectFresh()
        if (d.screenId) {
          const screen = findScreen(p, d.screenId)
          if (!screen) break
          const hits = screen.elements
            .filter((el) => !resolveProps(el, state.modeId).hidden && intersects(rect, elementWorldRect(screen, el, state.modeId)))
            .map((el) => el.id)
          const base = d.additive && d.base.kind === 'elements' && d.base.screenId === screen.id ? d.base.ids : []
          const ids = [...new Set([...base, ...hits])]
          select(ids.length ? { kind: 'elements', screenId: screen.id, ids } : NO_SELECTION)
        } else {
          const hits = p.screens.filter((s) => intersects(rect, screenRect(s))).map((s) => s.id)
          const base = d.additive && d.base.kind === 'screens' ? d.base.ids : []
          const ids = [...new Set([...base, ...hits])]
          select(ids.length ? { kind: 'screens', ids } : NO_SELECTION)
        }
        break
      }

      case 'move-elements':
      case 'move-screens': {
        let dx = world.x - d.start.x
        let dy = world.y - d.start.y
        if (!d.moved && Math.hypot(dx * zoom, dy * zoom) < DRAG_THRESHOLD) return
        if (!d.moved) {
          d.moved = true
          if (d.type === 'move-elements') setLiftedScreenId(d.screenId)
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const moved = { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
        const snap = e.altKey && e.metaKey ? { dx: 0, dy: 0, guides: [] } : snapRect(moved, d.refs, threshold)
        dx = Math.round(dx + snap.dx)
        dy = Math.round(dy + snap.dy)
        if (d.type === 'move-elements') {
          const starts = d.starts
          updateElements(d.screenId, d.ids, (_p, el) => {
            const s0 = starts.get(el.id)!
            return { x: s0.x + dx, y: s0.y + dy }
          }, false)
          const p = currentProjectFresh()
          const screen = findScreen(p, d.screenId)!
          const drop = screenAt(world.x, world.y, d.screenId)
          setOverlay({
            guides: snap.guides.map((g) => ({ ...g, value: g.value + (g.axis === 'x' ? screen.x : screen.y) })),
            guideSpan: screenRect(screen),
            dropScreenId: drop,
          })
        } else {
          const starts = d.starts
          mutate((draft) => {
            for (const s of draft.screens) {
              const s0 = starts.get(s.id)
              if (s0) {
                s.x = s0.x + dx
                s.y = s0.y + dy
              }
            }
          }, false)
          setOverlay({ guides: snap.guides, guideSpan: null })
        }
        break
      }

      case 'resize': {
        const dx = world.x - d.start.x
        const dy = world.y - d.start.y
        const isElement = d.target.kind === 'element'
        const origin = isElement ? findScreen(currentProjectFresh(), (d.target as { screenId: Id }).screenId) : null
        const ox = origin?.x ?? 0
        const oy = origin?.y ?? 0
        let r = resizeRect(d.rect, d.handle, dx, dy, e.shiftKey)
        const guides: SnapGuide[] = []
        if (!e.shiftKey) {
          if (d.handle.includes('e')) {
            const s = snapValue(r.x + r.width, d.xs, threshold)
            if (s) {
              r = { ...r, width: r.width + s.delta }
              guides.push({ axis: 'x', value: s.value + ox })
            }
          }
          if (d.handle.includes('w')) {
            const s = snapValue(r.x, d.xs, threshold)
            if (s) {
              r = { ...r, x: r.x + s.delta, width: r.width - s.delta }
              guides.push({ axis: 'x', value: s.value + ox })
            }
          }
          if (d.handle.includes('s')) {
            const s = snapValue(r.y + r.height, d.ys, threshold)
            if (s) {
              r = { ...r, height: r.height + s.delta }
              guides.push({ axis: 'y', value: s.value + oy })
            }
          }
          if (d.handle.includes('n')) {
            const s = snapValue(r.y, d.ys, threshold)
            if (s) {
              r = { ...r, y: r.y + s.delta, height: r.height - s.delta }
              guides.push({ axis: 'y', value: s.value + oy })
            }
          }
        }
        r = roundRect(r)
        if (d.target.kind === 'element') {
          updateElements(d.target.screenId, [d.target.id], { x: r.x, y: r.y, width: r.width, height: r.height }, false)
        } else {
          updateScreen(d.target.id, r, false)
        }
        setOverlay({ guides, guideSpan: origin ? screenRect(origin) : null })
        break
      }

      case 'draw': {
        let w = world.x - d.start.x
        let h = world.y - d.start.y
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * m
          h = Math.sign(h || 1) * m
        }
        setOverlay({ draw: normalizeRect(d.start.x, d.start.y, d.start.x + w, d.start.y + h) })
        break
      }

      case 'connect': {
        const targetId = screenAt(world.x, world.y, d.screenId)
        setOverlay({ connect: { from: d.from, to: world, target: targetId } })
        break
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null
      return
    }
    const d = drag.current
    drag.current = null
    setPanning(false)
    if (!d) return
    const state = getState()
    const world = toWorld(e.clientX, e.clientY)

    switch (d.type) {
      case 'move-elements': {
        if (!d.moved) {
          if (d.wasSelected) select({ kind: 'elements', screenId: d.screenId, ids: [d.clickedId] })
        } else {
          const drop = screenAt(world.x, world.y, d.screenId)
          if (drop) moveElementsToScreen(d.screenId, d.ids, drop)
        }
        endGesture()
        setLiftedScreenId(null)
        break
      }
      case 'move-screens':
        if (!d.moved && d.wasSelected) select({ kind: 'screens', ids: [d.clickedId] })
        endGesture()
        break
      case 'resize':
        endGesture()
        break
      case 'draw': {
        const rect = normalizeRect(d.start.x, d.start.y, world.x, world.y)
        const tiny = rect.width * state.camera.zoom < 4 && rect.height * state.camera.zoom < 4
        const drawn = overlay.draw ?? rect
        if (d.tool === 'screen') {
          if (tiny) addScreen(undefined, undefined, { x: d.start.x, y: d.start.y })
          else {
            const r = roundRect(drawn)
            addScreen(r.width, r.height, { x: r.x, y: r.y })
          }
          setTool('move')
        } else if (d.screenId) {
          const type = DRAW_TOOLS[d.tool as keyof typeof DRAW_TOOLS]!
          const screen = findScreen(currentProjectFresh(), d.screenId)!
          let props: Partial<ElementProps>
          if (tiny) {
            const def = defaultSize(type)
            props = {
              x: Math.round(d.start.x - screen.x - def.width / 2),
              y: Math.round(d.start.y - screen.y - def.height / 2),
            }
          } else {
            const r = roundRect(drawn)
            props = { x: r.x - screen.x, y: r.y - screen.y, width: r.width, height: r.height }
          }
          const id = addElement(screen.id, type, props)
          if (isTextType(type)) setState({ editingTextId: id })
        }
        break
      }
      case 'connect': {
        const targetId = screenAt(world.x, world.y, d.screenId)
        if (targetId) {
          updateElements(d.screenId, [d.elementId], (p) => ({
            interaction: {
              action: p.interaction?.action === 'overlay' ? 'overlay' : 'navigate',
              target: targetId,
              transition: p.interaction?.transition ?? 'dissolve',
              url: '',
            },
          }))
          const name = findScreen(currentProjectFresh(), targetId)?.name
          const scopeNote = state.scope === 'mode' && mode ? ` (solo en ${mode.name})` : ''
          toast(`Flujo creado hacia «${name}»${scopeNote}`)
        }
        break
      }
    }
    setOverlay({})
  }

  function cancelDrag() {
    const d = drag.current
    drag.current = null
    if (d && (d.type === 'move-elements' || d.type === 'move-screens' || d.type === 'resize')) endGesture()
    setOverlay({})
    setLiftedScreenId(null)
    setPanning(false)
  }

  function updateHover(e: React.PointerEvent) {
    const t = e.target as HTMLElement
    if (getState().tool !== 'move') {
      if (hover) setHover(null)
      return
    }
    const elId = t.closest<HTMLElement>('[data-el]')?.dataset.el
    const screenId =
      t.closest<HTMLElement>('[data-screen]')?.dataset.screen ??
      t.closest<HTMLElement>('[data-screen-label]')?.dataset.screenLabel
    let next: Hover = null
    if (elId && t.closest<HTMLElement>('[data-screen]')) next = { kind: 'element', screenId: screenId!, id: elId }
    else if (screenId) next = { kind: 'screen', id: screenId }
    if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-editing]')) return
    const labelId = t.closest<HTMLElement>('[data-screen-label]')?.dataset.screenLabel
    if (labelId) {
      setRenamingId(labelId)
      return
    }
    const elId = t.closest<HTMLElement>('[data-el]')?.dataset.el
    const screenId = t.closest<HTMLElement>('[data-screen]')?.dataset.screen
    if (!elId || !screenId) return
    const el = findScreen(currentProjectFresh(), screenId)?.elements.find((x) => x.id === elId)
    if (el && isTextType(el.type)) {
      select({ kind: 'elements', screenId, ids: [elId] })
      setState({ editingTextId: elId })
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const t = e.target as HTMLElement
    const elId = t.closest<HTMLElement>('[data-el]')?.dataset.el
    const screenId =
      t.closest<HTMLElement>('[data-screen]')?.dataset.screen ??
      t.closest<HTMLElement>('[data-screen-label]')?.dataset.screenLabel
    const sel = getState().selection
    if (elId && screenId) {
      if (!(sel.kind === 'elements' && sel.ids.includes(elId))) select({ kind: 'elements', screenId, ids: [elId] })
    } else if (screenId) {
      if (!(sel.kind === 'screens' && sel.ids.includes(screenId))) select({ kind: 'screens', ids: [screenId] })
    } else {
      select(NO_SELECTION)
    }
    setMenu({ x: e.clientX, y: e.clientY, items: contextItems(screenId ?? null) })
  }

  /* ----- Datos derivados para las capas ----- */
  const edges = useMemo(() => (showFlows ? computeFlows(project, modeId) : []), [project, modeId, showFlows])

  const toScreenRect = (r: Rect): Rect => {
    const p = worldToScreen(camera, r.x, r.y)
    return { x: p.x, y: p.y, width: r.width * camera.zoom, height: r.height * camera.zoom }
  }

  let selRects: Rect[] = []
  let hiddenSelected = false
  let sizeLabel: string | null = null
  if (selection.kind === 'screens') {
    const ss = project.screens.filter((s) => selection.ids.includes(s.id))
    selRects = ss.map(screenRect)
    if (ss.length === 1) sizeLabel = `${ss[0].width} × ${ss[0].height}`
  } else if (selection.kind === 'elements') {
    const screen = findScreen(project, selection.screenId)
    if (screen) {
      const els = screen.elements.filter((e) => selection.ids.includes(e.id))
      selRects = els.map((el) => elementWorldRect(screen, el, modeId))
      hiddenSelected = els.some((el) => resolveProps(el, modeId).hidden)
      if (els.length === 1) {
        const p = resolveProps(els[0], modeId)
        sizeLabel = `${p.width} × ${p.height}`
      }
    }
  }
  const selBounds = unionRects(selRects)
  const single = selRects.length === 1 && !editingTextId

  let hoverRect: Rect | null = null
  if (hover && !drag.current) {
    if (hover.kind === 'screen') {
      const s = findScreen(project, hover.id)
      if (s && !(selection.kind === 'screens' && selection.ids.includes(s.id))) hoverRect = screenRect(s)
    } else {
      const s = findScreen(project, hover.screenId)
      const el = s?.elements.find((x) => x.id === hover.id)
      if (s && el && !(selection.kind === 'elements' && selection.ids.includes(el.id))) hoverRect = elementWorldRect(s, el, modeId)
    }
  }

  const focusElementIds = selection.kind === 'elements' ? selection.ids : []
  const focusScreenIds = selection.kind === 'screens' ? selection.ids : []

  const grid = gridStyle(camera)
  const cursor = panning ? 'grabbing' : spaceDown || tool === 'hand' ? 'grab' : tool === 'move' ? 'default' : 'crosshair'

  return (
    <div
      ref={viewportRef}
      className={`canvas${scope === 'mode' && project.modes.length > 1 ? ' scope-mode' : ''}`}
      style={{ ...grid, cursor, '--mode': mode?.color } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId)
        pinch.current = null
        cancelDrag()
      }}
      onPointerLeave={() => !drag.current && hover && setHover(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="world"
        style={
          {
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            '--iz': 1 / camera.zoom,
          } as CSSProperties
        }
      >
        {project.screens.map((s) => (
          <ScreenView
            key={s.id}
            screen={s}
            modeId={modeId}
            editingId={editingTextId && s.elements.some((e) => e.id === editingTextId) ? editingTextId : null}
            lifted={liftedScreenId === s.id}
            dropTarget={overlay.dropScreenId === s.id || overlay.connect?.target === s.id}
          />
        ))}
        {showFlows && (
          <FlowLayer
            project={project}
            edges={edges}
            modeId={modeId}
            focus={[...focusElementIds, ...focusScreenIds].join(',')}
          />
        )}
      </div>

      {showFlows && <FlowMarkers zoom={camera.zoom} />}

      <ScreenLabels
        project={project}
        camera={camera}
        modeId={modeId}
        mode={mode}
        selectedIds={selection.kind === 'screens' ? selection.ids : []}
        renamingId={renamingId}
        onRenameDone={(id, name) => {
          setRenamingId(null)
          if (name && name.trim()) updateScreen(id, { name: name.trim() })
        }}
      />

      <HoverOutline rect={hoverRect ? toScreenRect(hoverRect) : null} />
      {!overlay.marquee && (
        <SelectionOverlay
          rects={selRects.map(toScreenRect)}
          bounds={selBounds ? toScreenRect(selBounds) : null}
          resizable={single && tool === 'move'}
          connector={single && selection.kind === 'elements' && tool === 'move'}
          dashed={hiddenSelected}
          sizeLabel={sizeLabel}
        />
      )}
      <Guides guides={overlay.guides ?? []} camera={camera} span={overlay.guideSpan ?? null} />

      {overlay.marquee && <div className="marquee" style={rectStyle(toScreenRect(overlay.marquee))} />}
      {overlay.draw && (
        <div className="draw-preview" style={rectStyle(toScreenRect(overlay.draw))}>
          {overlay.draw.width > 0 && (
            <span className="sel-size inside">
              {Math.round(overlay.draw.width)} × {Math.round(overlay.draw.height)}
            </span>
          )}
        </div>
      )}
      {overlay.connect && <ConnectPreview data={overlay.connect} camera={camera} />}

      {hiddenSelected && selBounds && mode && (
        <div className="hidden-note" style={{ left: toScreenRect(selBounds).x, top: toScreenRect(selBounds).y - 22 }}>
          Oculto en {mode.name}
        </div>
      )}

      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function ConnectPreview({
  data,
  camera,
}: {
  data: NonNullable<Overlay['connect']>
  camera: Camera
}) {
  const a = worldToScreen(camera, data.from.x + data.from.width, data.from.y + data.from.height / 2)
  const b = worldToScreen(camera, data.to.x, data.to.y)
  const k = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return (
    <svg className="flow-layer connect-layer">
      <path
        d={`M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`}
        className={`connect-line${data.target ? ' has-target' : ''}`}
      />
      <circle cx={a.x} cy={a.y} r={4} className="connect-dot" />
      <circle cx={b.x} cy={b.y} r={5} className="connect-dot" />
    </svg>
  )
}

function rectStyle(r: Rect): CSSProperties {
  return { left: r.x, top: r.y, width: r.width, height: r.height }
}

function gridStyle(cam: Camera): CSSProperties {
  let step = 24 * cam.zoom
  while (step < 14) step *= 4
  while (step > 80) step /= 4
  const show = cam.zoom > 0.15
  return {
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${cam.x}px ${cam.y}px`,
    backgroundImage: show ? 'radial-gradient(var(--dot) 1px, transparent 1.2px)' : 'none',
  }
}

function defaultSize(type: ElementType) {
  const defaults: Record<ElementType, { width: number; height: number }> = {
    rect: { width: 160, height: 100 },
    ellipse: { width: 100, height: 100 },
    text: { width: 200, height: 24 },
    button: { width: 200, height: 48 },
    input: { width: 280, height: 48 },
    image: { width: 240, height: 160 },
    icon: { width: 24, height: 24 },
  }
  return defaults[type] ?? { width: BASE_PROPS.width, height: BASE_PROPS.height }
}

function siblingRects(p: Project, screenId: Id, exclude: Id[], modeId: Id): Rect[] {
  const s = findScreen(p, screenId)
  if (!s) return []
  const rects: Rect[] = [{ x: 0, y: 0, width: s.width, height: s.height }]
  for (const el of s.elements) {
    if (exclude.includes(el.id)) continue
    const r = resolveProps(el, modeId)
    if (r.hidden) continue
    rects.push({ x: r.x, y: r.y, width: r.width, height: r.height })
  }
  return rects
}

function currentProjectFresh(): Project {
  const s = getState()
  return s.projects[s.openId!]
}

export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

function contextItems(screenId: Id | null): MenuEntry[] {
  const sel = getState().selection
  const hasClip = !!getState().clipboard
  if (sel.kind === 'none') {
    return [
      { label: 'Pegar', icon: 'copy', shortcut: `${MOD}V`, disabled: !hasClip, onSelect: paste },
      { label: 'Nueva pantalla', icon: 'frame', shortcut: 'F', onSelect: () => setTool('screen') },
    ]
  }
  const items: MenuEntry[] = [
    { label: 'Copiar', icon: 'copy', shortcut: `${MOD}C`, onSelect: copySelection },
    { label: 'Pegar', shortcut: `${MOD}V`, disabled: !hasClip, onSelect: paste },
    { label: 'Duplicar', shortcut: `${MOD}D`, onSelect: duplicateSelection },
    'separator',
    { label: 'Traer al frente', shortcut: ']', onSelect: () => reorderSelection('front') },
    { label: 'Enviar al fondo', shortcut: '[', onSelect: () => reorderSelection('back') },
    'separator',
  ]
  if (screenId) {
    items.push({ label: 'Probar desde aquí', icon: 'play', shortcut: `${MOD}↵`, onSelect: () => play(screenId) })
    if (sel.kind === 'screens') {
      items.push(
        { label: 'Usar como pantalla de inicio', icon: 'flows', onSelect: () => setStartScreen(screenId) },
        { label: 'Comparar modos', icon: 'compare', onSelect: () => setState({ compareScreenId: screenId }) },
      )
    }
    items.push('separator')
  }
  items.push({ label: 'Eliminar', icon: 'trash', shortcut: '⌫', danger: true, onSelect: deleteSelection })
  return items
}

