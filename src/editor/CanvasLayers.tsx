import { memo, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { Camera, Handle, SnapGuide } from '../model/geometry'
import { worldToScreen } from '../model/geometry'
import type { FlowEdge } from '../model/flows'
import { isScreenAvailable, resolveProps, screenChangesInMode } from '../model/modes'
import type { DesignElement, ElementProps, Id, Mode, Project, Rect, Screen, Section } from '../model/types'
import { ScreenContent, elementStyle } from '../render/ElementView'
import { Icon } from '../render/icons'
import { play, setState, updateElements } from '../store/store'

/* ---------- Pantalla en el mundo ---------- */

interface ScreenViewProps {
  screen: Screen
  modeId: Id
  editingId: Id | null
  lifted: boolean
  dropTarget: boolean
}

export const ScreenView = memo(function ScreenView({ screen, modeId, editingId, lifted, dropTarget }: ScreenViewProps) {
  const available = isScreenAvailable(screen, modeId)
  const editing = editingId ? screen.elements.find((e) => e.id === editingId) : undefined
  return (
    <div
      data-screen={screen.id}
      className={`screen${available ? '' : ' screen-unavailable'}${lifted ? ' screen-lifted' : ''}${dropTarget ? ' screen-drop' : ''}`}
      style={{
        left: screen.x,
        top: screen.y,
        width: screen.width,
        height: screen.height,
        background: screen.fill || 'transparent',
      }}
    >
      <ScreenContent screen={screen} modeId={modeId} context="canvas" editingId={editingId} />
      {editing && (
        <InlineTextEditor key={editing.id} screenId={screen.id} el={editing} props={resolveProps(editing, modeId)} />
      )}
    </div>
  )
})

function InlineTextEditor({ screenId, el, props }: { screenId: Id; el: DesignElement; props: ElementProps }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [])
  const commit = () => {
    if (done.current) return
    done.current = true
    const text = (ref.current?.innerText ?? props.text).replace(/\n$/, '')
    if (text !== props.text) updateElements(screenId, [el.id], { text })
    setState({ editingTextId: null })
  }
  const style: CSSProperties = { ...elementStyle(el.type, props), cursor: 'text' }
  return (
    <div className={`el el-${el.type} el-editing`} style={style} data-editing>
      <div
        ref={ref}
        className="el-content el-content-edit"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          const submit =
            e.key === 'Escape' ||
            (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ||
            (e.key === 'Enter' && !e.shiftKey && el.type !== 'text')
          if (submit) {
            e.preventDefault()
            ref.current?.blur()
          }
        }}
      >
        {props.text}
      </div>
    </div>
  )
}

/* ---------- Etiquetas de pantalla (tamaño constante) ---------- */

interface LabelsProps {
  project: Project
  camera: Camera
  modeId: Id
  mode: Mode | undefined
  selectedIds: Id[]
  renamingId: Id | null
  onRenameDone: (id: Id, name: string | null) => void
}

export function ScreenLabels({ project, camera, modeId, mode, selectedIds, renamingId, onRenameDone }: LabelsProps) {
  // Muy lejos no se leen: solo se muestran las seleccionadas.
  const tiny = camera.zoom < 0.09
  return (
    <div className="labels-layer">
      {project.screens.map((s) => {
        if (tiny && !selectedIds.includes(s.id)) return null
        const p = worldToScreen(camera, s.x, s.y)
        const width = s.width * camera.zoom
        const available = isScreenAvailable(s, modeId)
        const changes = project.modes.length > 1 ? screenChangesInMode(s, modeId) : 0
        const selected = selectedIds.includes(s.id)
        const isStart = project.startScreenId === s.id
        return (
          <div
            key={s.id}
            className={`screen-label${selected ? ' selected' : ''}${available ? '' : ' unavailable'}`}
            style={{ left: p.x, top: p.y - 24, maxWidth: Math.max(width, 60) }}
            data-screen-label={s.id}
          >
            {isStart && (
              <span className="label-start" title="Pantalla de inicio">
                <Icon name="play" size={10} strokeWidth={2.4} />
              </span>
            )}
            {renamingId === s.id ? (
              <RenameInput initial={s.name} onDone={(name) => onRenameDone(s.id, name)} />
            ) : (
              <span className="label-name">{s.name}</span>
            )}
            {!available && mode && width > 120 && (
              <span className="label-badge off" style={{ '--mode': mode.color } as CSSProperties}>
                No existe en {mode.name}
              </span>
            )}
            {available && changes > 0 && mode && width > 140 && (
              <span
                className="label-badge"
                style={{ '--mode': mode.color } as CSSProperties}
                title={`${changes} elementos cambian en ${mode.name}`}
              >
                {changes} {changes === 1 ? 'cambio' : 'cambios'}
              </span>
            )}
            {width > 90 && available && (
              <button
                className="label-play"
                title="Probar desde esta pantalla"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  play(s.id)
                }}
              >
                <Icon name="play" size={11} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="label-rename"
      defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

/* ---------- Secciones ---------- */

export function SectionLabels({
  sections,
  camera,
  selectedId,
  renamingId,
  onRenameDone,
}: {
  sections: Section[]
  camera: Camera
  selectedId: Id | null
  renamingId: Id | null
  onRenameDone: (id: Id, name: string | null) => void
}) {
  if (sections.length === 0) return null
  return (
    <div className="labels-layer">
      {sections.map((sec) => {
        const p = worldToScreen(camera, sec.x, sec.y)
        const w = sec.width * camera.zoom
        return (
          <div
            key={sec.id}
            className={`section-label${selectedId === sec.id ? ' selected' : ''}`}
            data-section-label={sec.id}
            style={{ left: p.x, top: p.y - 36, maxWidth: Math.max(80, w), '--sec': sec.color } as CSSProperties}
          >
            {renamingId === sec.id ? (
              <RenameInput initial={sec.name} onDone={(name) => onRenameDone(sec.id, name)} />
            ) : (
              <span>{sec.name}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Flujos ---------- */

interface FlowLayerProps {
  project: Project
  edges: FlowEdge[]
  modeId: Id
  /** Ids enfocados (elementos o pantallas seleccionados) separados por comas. */
  focus: string
}

export function flowPath(from: Rect, to: Rect) {
  const fx2 = from.x + from.width
  const fy2 = from.y + from.height
  const tx2 = to.x + to.width
  const ty2 = to.y + to.height
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b))
  let sx: number, sy: number, ex: number, ey: number, horizontal: boolean
  if (to.x > fx2) {
    ;[sx, sy, ex, horizontal] = [fx2, from.y + from.height / 2, to.x, true]
    ey = clamp(sy, to.y + 24, ty2 - 24)
  } else if (tx2 < from.x) {
    ;[sx, sy, ex, horizontal] = [from.x, from.y + from.height / 2, tx2, true]
    ey = clamp(sy, to.y + 24, ty2 - 24)
  } else if (to.y > fy2) {
    ;[sx, sy, ey, horizontal] = [from.x + from.width / 2, fy2, to.y, false]
    ex = clamp(sx, to.x + 24, tx2 - 24)
  } else {
    ;[sx, sy, ey, horizontal] = [from.x + from.width / 2, from.y, ty2, false]
    ex = clamp(sx, to.x + 24, tx2 - 24)
  }
  const k = horizontal ? Math.max(40, Math.abs(ex - sx) * 0.5) : Math.max(40, Math.abs(ey - sy) * 0.5)
  const c1 = horizontal ? [sx + Math.sign(ex - sx) * k, sy] : [sx, sy + Math.sign(ey - sy) * k]
  const c2 = horizontal ? [ex - Math.sign(ex - sx) * k, ey] : [ex, ey - Math.sign(ey - sy) * k]
  return { d: `M${sx},${sy} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${ex},${ey}`, sx, sy, ex, ey }
}

/**
 * Flechas de los flujos en coordenadas del lienzo: viven dentro del mundo
 * transformado, así que mover o hacer zoom no las vuelve a calcular. El trazo
 * no escala; las puntas y los puntos se ajustan al zoom en <FlowMarkers>.
 */
export const FlowLayer = memo(function FlowLayer({ project, edges, modeId, focus }: FlowLayerProps) {
  const screens = useMemo(() => new Map(project.screens.map((s) => [s.id, s])), [project.screens])
  const focusSet = useMemo(() => new Set(focus ? focus.split(',') : []), [focus])
  const paths = useMemo(
    () =>
      edges.flatMap((edge) => {
        const from = screens.get(edge.fromScreenId)
        const to = screens.get(edge.toScreenId)
        if (!from || !to || from.id === to.id) return []
        let a: Rect
        if (edge.fromElementId) {
          const el = from.elements.find((e) => e.id === edge.fromElementId)
          if (!el) return []
          const p = resolveProps(el, modeId)
          a = { x: from.x + p.x, y: from.y + p.y, width: p.width, height: p.height }
        } else {
          a = { x: from.x, y: from.y, width: from.width, height: Math.min(from.height, 200) }
        }
        const b = { x: to.x, y: to.y, width: to.width, height: to.height }
        return [{ edge, d: flowPath(a, b).d }]
      }),
    [edges, screens, modeId],
  )
  return (
    <svg className="world-flows" aria-hidden="true">
      {paths.map(({ edge, d }) => {
        const focused =
          focusSet.has(edge.fromElementId) || focusSet.has(edge.fromScreenId) || focusSet.has(edge.toScreenId)
        const dim = focusSet.size > 0 && !focused
        const kind = edge.broken ? 'broken' : dim ? 'dim' : 'ok'
        return (
          <path
            key={edge.id}
            d={d}
            className={`flow-line flow-${kind}${focused ? ' flow-focus' : ''}${edge.action === 'overlay' ? ' flow-overlay' : ''}${edge.action === 'auto' ? ' flow-auto' : ''}`}
            markerStart={`url(#flow-dot-${kind})`}
            markerEnd={`url(#flow-arrow-${kind})`}
          />
        )
      })}
    </svg>
  )
})

/** Puntas y puntos de las flechas, con tamaño constante en pantalla. */
export const FlowMarkers = memo(function FlowMarkers({ zoom }: { zoom: number }) {
  const size = 9 / zoom
  return (
    <svg className="flow-markers" aria-hidden="true">
      <defs>
        {['ok', 'broken', 'dim'].map((k) => (
          <g key={k}>
            <marker
              id={`flow-arrow-${k}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={size}
              markerHeight={size}
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className={`flow-head flow-head-${k}`} />
            </marker>
            <marker
              id={`flow-dot-${k}`}
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth={size}
              markerHeight={size}
              markerUnits="userSpaceOnUse"
            >
              <circle cx="5" cy="5" r="3.6" className={`flow-dot flow-dot-${k}`} />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  )
})

/* ---------- Selección, tiradores y guías ---------- */

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

interface SelectionOverlayProps {
  rects: Rect[]
  bounds: Rect | null
  resizable: boolean
  connector: boolean
  dashed: boolean
  sizeLabel: string | null
}

export function SelectionOverlay({ rects, bounds, resizable, connector, dashed, sizeLabel }: SelectionOverlayProps) {
  if (!bounds) return null
  const pos = (h: Handle): CSSProperties => {
    const x = h.includes('w') ? 0 : h.includes('e') ? bounds.width : bounds.width / 2
    const y = h.includes('n') ? 0 : h.includes('s') ? bounds.height : bounds.height / 2
    return { left: bounds.x + x, top: bounds.y + y }
  }
  return (
    <div className="selection-layer">
      {rects.length > 1 &&
        rects.map((r, i) => (
          <div key={i} className="sel-item" style={{ left: r.x, top: r.y, width: r.width, height: r.height }} />
        ))}
      <div
        className={`sel-box${dashed ? ' dashed' : ''}`}
        style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      />
      {resizable &&
        HANDLES.map((h) => (
          <div key={h} className={`sel-handle h-${h}`} data-handle={h} style={pos(h)} />
        ))}
      {connector && (
        <div
          className="sel-connector"
          data-connector
          title="Arrastra hasta una pantalla para crear un flujo"
          style={{ left: bounds.x + bounds.width + 14, top: bounds.y + bounds.height / 2 }}
        >
          <Icon name="plus" size={10} strokeWidth={3} />
        </div>
      )}
      {sizeLabel && (
        <div className="sel-size" style={{ left: bounds.x + bounds.width / 2, top: bounds.y + bounds.height + 8 }}>
          {sizeLabel}
        </div>
      )}
    </div>
  )
}

export function HoverOutline({ rect }: { rect: Rect | null }) {
  if (!rect) return null
  return <div className="hover-box" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
}

export function Guides({
  guides,
  camera,
  span,
}: {
  guides: SnapGuide[]
  camera: Camera
  span: Rect | null
}) {
  if (guides.length === 0) return null
  return (
    <svg className="guides-layer">
      {guides.map((g, i) => {
        if (g.axis === 'x') {
          const x = g.value * camera.zoom + camera.x
          const y1 = span ? span.y * camera.zoom + camera.y : -1e4
          const y2 = span ? (span.y + span.height) * camera.zoom + camera.y : 1e5
          return <line key={i} x1={x} x2={x} y1={y1} y2={y2} className="guide" />
        }
        const y = g.value * camera.zoom + camera.y
        const x1 = span ? span.x * camera.zoom + camera.x : -1e4
        const x2 = span ? (span.x + span.width) * camera.zoom + camera.x : 1e5
        return <line key={i} x1={x1} x2={x2} y1={y} y2={y} className="guide" />
      })}
    </svg>
  )
}
