import { useDeferredValue, useMemo, useRef, useState, type CSSProperties } from 'react'
import { computeFlows } from '../model/flows'
import { isOverridden, isScreenAvailable, overriddenKeys, resolveProps } from '../model/modes'
import { elementWorldRect, findScreen, screenRect } from '../model/project'
import type { DesignElement, ElementType, Id, Project, Rect } from '../model/types'
import { Icon } from '../render/icons'
import {
  addScreen,
  getState,
  renameElement,
  select,
  setCamera,
  togglePanel,
  updateElements,
  updateScreen,
  useStore,
} from '../store/store'

const TYPE_ICON: Record<ElementType, string> = {
  rect: 'square',
  ellipse: 'circle',
  text: 'type',
  button: 'button-tool',
  input: 'input-tool',
  image: 'image-icon',
  icon: 'star',
}

/** Centra un rectángulo si está fuera de la vista, sin cambiar el zoom. */
function reveal(rect: Rect) {
  const { camera, viewport } = getState()
  const x1 = rect.x * camera.zoom + camera.x
  const y1 = rect.y * camera.zoom + camera.y
  const x2 = x1 + rect.width * camera.zoom
  const y2 = y1 + rect.height * camera.zoom
  const visible = x2 > 40 && x1 < viewport.w - 40 && y2 > 40 && y1 < viewport.h - 40
  if (visible) return
  setCamera({
    ...camera,
    x: viewport.w / 2 - (rect.x + rect.width / 2) * camera.zoom,
    y: viewport.h / 2 - (rect.y + rect.height / 2) * camera.zoom,
  })
}

function closeOnNarrow() {
  if (window.innerWidth < 900) togglePanel('left', false)
}

export function LayersPanel({ project: live }: { project: Project }) {
  // La lista se pone al día con prioridad baja: no frena el lienzo al arrastrar.
  const project = useDeferredValue(live)
  const selection = useStore((s) => s.selection)
  const modeId = useStore((s) => s.modeId)
  const mode = project.modes.find((m) => m.id === modeId)
  const [expanded, setExpanded] = useState<Set<Id>>(() => new Set())
  const [renaming, setRenaming] = useState<Id | null>(null)

  // Al seleccionar un elemento desde el lienzo, se despliega su pantalla.
  const [prevSelection, setPrevSelection] = useState(selection)
  if (selection !== prevSelection) {
    setPrevSelection(selection)
    if (selection.kind === 'elements' && !expanded.has(selection.screenId)) {
      setExpanded(new Set(expanded).add(selection.screenId))
    }
  }

  const flows = useMemo(() => computeFlows(project, modeId), [project, modeId])
  const broken = flows.filter((f) => f.broken)

  const toggle = (id: Id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="panel panel-left" aria-label="Capas">
      <div className="panel-section-head">
        <span>Pantallas</span>
        <span className="count">{project.screens.length}</span>
        <button
          className="icon-btn tiny"
          title="Añadir pantalla"
          onClick={() => {
            const id = addScreen()
            const s = id && findScreen(getState().projects[project.id], id)
            if (s) reveal(screenRect(s))
          }}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
      <div className="layers">
        {project.screens.map((s) => {
          const open = expanded.has(s.id)
          const available = isScreenAvailable(s, modeId)
          const screenSelected = selection.kind === 'screens' && selection.ids.includes(s.id)
          return (
            <div key={s.id} className="layer-group">
              <div
                className={`layer-row screen-row${screenSelected ? ' selected' : ''}${available ? '' : ' muted-row'}`}
                onClick={(e) => {
                  if (e.shiftKey && selection.kind === 'screens') {
                    const ids = selection.ids.includes(s.id)
                      ? selection.ids.filter((x) => x !== s.id)
                      : [...selection.ids, s.id]
                    select({ kind: 'screens', ids })
                  } else {
                    select({ kind: 'screens', ids: [s.id] })
                    reveal(screenRect(s))
                    closeOnNarrow()
                  }
                }}
                onDoubleClick={() => setRenaming(s.id)}
              >
                <button
                  className={`chev${open ? ' open' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(s.id)
                  }}
                  aria-label={open ? 'Contraer' : 'Expandir'}
                >
                  <Icon name="chevron-right" size={12} />
                </button>
                <Icon name="frame" size={13} className="layer-icon" />
                {renaming === s.id ? (
                  <LayerRename
                    initial={s.name}
                    onDone={(v) => {
                      setRenaming(null)
                      if (v) updateScreen(s.id, { name: v })
                    }}
                  />
                ) : (
                  <span className="layer-name">{s.name}</span>
                )}
                {project.startScreenId === s.id && (
                  <span className="layer-tag" title="Pantalla de inicio">
                    <Icon name="play" size={9} strokeWidth={2.6} />
                  </span>
                )}
                {!available && mode && (
                  <span className="layer-tag off" style={{ '--mode': mode.color } as CSSProperties} title={`No existe en ${mode.name}`}>
                    <Icon name="eye-off" size={11} />
                  </span>
                )}
              </div>
              {open &&
                [...s.elements].reverse().map((el) => (
                  <ElementRow
                    key={el.id}
                    el={el}
                    screenId={s.id}
                    modeId={modeId}
                    modeColor={mode?.color ?? ''}
                    multiMode={project.modes.length > 1}
                    selected={selection.kind === 'elements' && selection.screenId === s.id && selection.ids.includes(el.id)}
                    renaming={renaming === el.id}
                    onRename={setRenaming}
                    onSelect={(shift) => {
                      if (shift && selection.kind === 'elements' && selection.screenId === s.id) {
                        const ids = selection.ids.includes(el.id)
                          ? selection.ids.filter((x) => x !== el.id)
                          : [...selection.ids, el.id]
                        select(ids.length ? { kind: 'elements', screenId: s.id, ids } : { kind: 'none' })
                      } else {
                        select({ kind: 'elements', screenId: s.id, ids: [el.id] })
                        reveal(elementWorldRect(s, el, modeId))
                      }
                    }}
                  />
                ))}
              {open && s.elements.length === 0 && <div className="layer-empty">Sin elementos</div>}
            </div>
          )
        })}
      </div>

      <div className="panel-section-head">
        <span>Flujos{mode && project.modes.length > 1 ? ` en ${mode.name}` : ''}</span>
        <span className="count">{flows.length}</span>
      </div>
      <div className="flow-summary">
        {broken.length > 0 ? (
          <ul className="broken-list">
            {broken.map((f) => {
              const from = findScreen(project, f.fromScreenId)
              const el = from?.elements.find((x) => x.id === f.fromElementId)
              const to = findScreen(project, f.toScreenId)
              return (
                <li key={f.id}>
                  <button
                    className="broken-item"
                    onClick={() => {
                      if (from && el) {
                        select({ kind: 'elements', screenId: from.id, ids: [el.id] })
                        reveal(elementWorldRect(from, el, modeId))
                        useStore.setState({ inspectorTab: 'prototype' })
                      }
                    }}
                  >
                    <Icon name="info" size={13} />
                    <span>
                      <b>{el?.name ?? 'Elemento'}</b> en {from?.name} lleva a {to ? `«${to.name}», que no existe en este modo` : 'una pantalla eliminada'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small">
            {flows.length === 0
              ? 'Aún no hay flujos. Selecciona un elemento y arrastra el círculo azul hasta otra pantalla.'
              : 'Todos los flujos llegan a pantallas disponibles en este modo.'}
          </p>
        )}
      </div>
    </aside>
  )
}

function ElementRow({
  el,
  screenId,
  modeId,
  modeColor,
  multiMode,
  selected,
  renaming,
  onRename,
  onSelect,
}: {
  el: DesignElement
  screenId: Id
  modeId: Id
  modeColor: string
  multiMode: boolean
  selected: boolean
  renaming: boolean
  onRename: (id: Id | null) => void
  onSelect: (shift: boolean) => void
}) {
  const p = resolveProps(el, modeId)
  const changed = multiMode && overriddenKeys(el, modeId).length > 0
  const visibilityOverridden = isOverridden(el, modeId, 'hidden')
  return (
    <div
      className={`layer-row el-row${selected ? ' selected' : ''}${p.hidden ? ' muted-row' : ''}`}
      onClick={(e) => onSelect(e.shiftKey)}
      onDoubleClick={() => onRename(el.id)}
    >
      <Icon name={TYPE_ICON[el.type]} size={13} className="layer-icon" />
      {renaming ? (
        <LayerRename
          initial={el.name}
          onDone={(v) => {
            onRename(null)
            if (v) renameElement(screenId, el.id, v)
          }}
        />
      ) : (
        <span className="layer-name">{el.name}</span>
      )}
      {p.interaction && <Icon name="zap" size={11} className="layer-link" />}
      {changed && (
        <span
          className="override-dot"
          style={{ '--mode': modeColor } as CSSProperties}
          title="Tiene cambios en este modo"
        />
      )}
      <button
        className={`eye${p.hidden ? ' off' : ''}${visibilityOverridden ? ' overridden' : ''}`}
        style={{ '--mode': modeColor } as CSSProperties}
        title={p.hidden ? 'Mostrar' : 'Ocultar'}
        onClick={(e) => {
          e.stopPropagation()
          updateElements(screenId, [el.id], { hidden: !p.hidden })
        }}
      >
        <Icon name={p.hidden ? 'eye-off' : 'eye'} size={13} />
      </button>
    </div>
  )
}

function LayerRename({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const done = useRef(false)
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      className="layer-rename"
      defaultValue={initial}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}
