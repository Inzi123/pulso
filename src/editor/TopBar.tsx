import { useRef, useState, type CSSProperties } from 'react'
import { MODE_COLORS } from '../model/defaults'
import { HiloMark } from '../ui/Brand'
import type { Project } from '../model/types'
import { Icon } from '../render/icons'
import { Menu, MOD, Select, TextField, type MenuEntry } from '../ui/controls'
import {
  addMode,
  closeProject,
  deleteMode,
  moveMode,
  play,
  redo,
  renameProject,
  setMode,
  setScope,
  setState,
  togglePanel,
  undo,
  updateMode,
  useStore,
  zoomBy,
  zoomTo,
  zoomToFit,
  zoomToSelection,
} from '../store/store'

export function TopBar({ project }: { project: Project }) {
  const modeId = useStore((s) => s.modeId)
  const scope = useStore((s) => s.scope)
  const zoom = useStore((s) => s.camera.zoom)
  const showFlows = useStore((s) => s.showFlows)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const panels = useStore((s) => s.panels)
  const aiOpen = useStore((s) => s.aiOpen)
  const [zoomMenu, setZoomMenu] = useState<{ x: number; y: number } | null>(null)
  const [modesOpen, setModesOpen] = useState(false)
  const mode = project.modes.find((m) => m.id === modeId)
  const multi = project.modes.length > 1

  const zoomItems: MenuEntry[] = [
    { label: 'Acercar', shortcut: `${MOD}+`, onSelect: () => zoomBy(1.25) },
    { label: 'Alejar', shortcut: `${MOD}−`, onSelect: () => zoomBy(0.8) },
    'separator',
    { label: 'Ver todo', shortcut: '⇧1', onSelect: zoomToFit },
    { label: 'Ir a la selección', shortcut: '⇧2', onSelect: zoomToSelection },
    { label: 'Zoom al 50 %', onSelect: () => zoomTo(0.5) },
    { label: 'Zoom al 100 %', shortcut: '⇧0', onSelect: () => zoomTo(1) },
    { label: 'Zoom al 200 %', onSelect: () => zoomTo(2) },
  ]

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="brand-btn" onClick={closeProject} title="Volver a tus proyectos">
          <HiloMark />
        </button>
        <button
          className={`icon-btn panel-toggle${panels.left ? ' on' : ''}`}
          title="Capas"
          onClick={() => togglePanel('left')}
        >
          <Icon name="layers" size={16} />
        </button>
        <div className="project-title">
          <TextField
            className="title-input"
            value={project.name}
            onCommit={(v) => renameProject(project.id, v)}
          />
          <span className="kind-badge" title={project.kind === 'app' ? 'Aplicación móvil' : 'Sitio web'}>
            <Icon name={project.kind === 'app' ? 'smartphone' : 'globe'} size={12} />
            {project.kind === 'app' ? 'App' : 'Web'}
          </span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="mode-switch" role="radiogroup" aria-label="Modo activo">
          {project.modes.map((m, i) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={m.id === modeId}
              className={m.id === modeId ? 'on' : ''}
              style={{ '--mode': m.color } as CSSProperties}
              onClick={() => setMode(m.id)}
              title={`${m.name} (Alt+${i + 1})`}
            >
              <span className="mode-dot" />
              <span className="mode-name">{m.name}</span>
            </button>
          ))}
          <button className="mode-manage" onClick={() => setModesOpen(true)} title="Gestionar modos">
            <Icon name={multi ? 'sliders' : 'plus'} size={14} />
            {!multi && <span className="mode-name">Añadir modos</span>}
          </button>
        </div>
        {multi && mode && (
          <button
            className={`scope-btn${scope === 'mode' ? ' on' : ''}`}
            style={{ '--mode': mode.color } as CSSProperties}
            onClick={() => setScope(scope === 'mode' ? 'all' : 'mode')}
            title="Elige si tus cambios afectan a todos los modos o solo al activo (E)"
          >
            <Icon name={scope === 'mode' ? 'lock' : 'layers'} size={13} />
            <span>{scope === 'mode' ? `Editando solo ${mode.name}` : 'Editando todos los modos'}</span>
          </button>
        )}
        {modesOpen && <ModesDialog project={project} onClose={() => setModesOpen(false)} />}
      </div>

      <div className="topbar-right">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title={`Deshacer (${MOD}Z)`}>
          <Icon name="undo" size={16} />
        </button>
        <button className="icon-btn hide-sm" onClick={redo} disabled={!canRedo} title={`Rehacer (${MOD}⇧Z)`}>
          <Icon name="redo" size={16} />
        </button>
        <button
          className={`icon-btn${showFlows ? ' on' : ''}`}
          onClick={() => setState({ showFlows: !showFlows })}
          title="Mostrar flujos (L)"
        >
          <Icon name="flows" size={16} />
        </button>
        <button
          className="zoom-btn"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setZoomMenu({ x: r.right - 200, y: r.bottom + 6 })
          }}
          title="Zoom"
        >
          {Math.round(zoom * 100)} %
          <Icon name="chevron-down" size={12} />
        </button>
        <button className="icon-btn hide-sm" onClick={() => setState({ helpOpen: true })} title="Atajos de teclado (?)">
          <Icon name="keyboard" size={16} />
        </button>
        <button
          className={`icon-btn panel-toggle${panels.right ? ' on' : ''}`}
          title="Propiedades"
          onClick={() => togglePanel('right')}
        >
          <Icon name="panel-right" size={16} />
        </button>
        <button
          className={`ai-btn${aiOpen ? ' on' : ''}`}
          onClick={() => setState({ aiOpen: !aiOpen })}
          title="Asistente con IA"
        >
          <Icon name="sparkles" size={15} />
          <span className="hide-sm">Asistente</span>
        </button>
        <button className="play-btn" onClick={() => play()} title={`Probar prototipo (${MOD}↵)`}>
          <Icon name="play" size={14} strokeWidth={2.2} />
          <span>Probar</span>
        </button>
        {zoomMenu && <Menu x={zoomMenu.x} y={zoomMenu.y} items={zoomItems} onClose={() => setZoomMenu(null)} />}
      </div>
    </header>
  )
}

/* ---------- Gestión de modos ---------- */

function ModesDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const n = name.trim() || `Modo ${project.modes.length + 1}`
    addMode(n, copyFrom || undefined)
    setName('')
    inputRef.current?.focus()
  }

  return (
    <div className="popover-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="popover modes-popover" role="dialog" aria-label="Modos">
        <header className="popover-head">
          <div>
            <h3>Modos</h3>
            <p className="muted">
              Cada modo es una variante del proyecto: planes, roles, idiomas… Las pantallas pueden cambiar
              textos, colores, visibilidad o flujos según el modo.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </header>
        <ul className="modes-list">
          {project.modes.map((m, i) => (
            <li key={m.id} className="mode-row">
              <label className="mode-swatch" style={{ background: m.color }} title="Color del modo">
                <input type="color" value={m.color} onChange={(e) => updateMode(m.id, { color: e.target.value })} />
              </label>
              <TextField className="text-input" value={m.name} onCommit={(v) => updateMode(m.id, { name: v })} />
              <span className="mode-key">Alt+{i + 1}</span>
              <button className="icon-btn tiny" disabled={i === 0} onClick={() => moveMode(m.id, -1)} title="Subir">
                <Icon name="chevron-left" size={13} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <button
                className="icon-btn tiny"
                disabled={i === project.modes.length - 1}
                onClick={() => moveMode(m.id, 1)}
                title="Bajar"
              >
                <Icon name="chevron-down" size={13} />
              </button>
              <button className="icon-btn tiny" onClick={() => addMode(`${m.name} (copia)`, m.id)} title="Duplicar modo">
                <Icon name="copy" size={13} />
              </button>
              {confirmDelete === m.id ? (
                <button
                  className="btn danger tiny-btn"
                  onClick={() => {
                    deleteMode(m.id)
                    setConfirmDelete(null)
                  }}
                >
                  Eliminar
                </button>
              ) : (
                <button
                  className="icon-btn tiny"
                  disabled={project.modes.length <= 1}
                  onClick={() => setConfirmDelete(m.id)}
                  title={project.modes.length <= 1 ? 'Debe quedar al menos un modo' : 'Eliminar modo y sus cambios'}
                >
                  <Icon name="trash" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mode-add">
          <span className="mode-swatch static" style={{ background: MODE_COLORS[project.modes.length % MODE_COLORS.length] }} />
          <input
            ref={inputRef}
            className="text-input"
            placeholder="Nombre del nuevo modo (p. ej. Premium)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Select
            value={copyFrom}
            onChange={setCopyFrom}
            title="Copiar los cambios de otro modo"
            options={[
              { value: '', label: 'Desde la base' },
              ...project.modes.map((m) => ({ value: m.id, label: `Copia de ${m.name}` })),
            ]}
          />
          <button className="btn primary" onClick={add}>
            Añadir
          </button>
        </div>
      </div>
    </div>
  )
}
