import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createMode } from '../model/defaults'
import { parseProject } from '../model/project'
import { TEMPLATES } from '../model/templates'
import type { Project, ProjectKind } from '../model/types'
import { ScreenThumb } from '../render/ElementView'
import { Icon } from '../render/icons'
import { HiloMark } from '../ui/Brand'
import { Dialog, Menu, Segmented, type MenuEntry } from '../ui/controls'
import {
  addProject,
  deleteProject,
  duplicateProject,
  newFromTemplate,
  newProject,
  openProject,
  renameProject,
  toast,
  useStore,
} from '../store/store'

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
function ago(t: number) {
  const s = Math.round((t - Date.now()) / 1000)
  if (Math.abs(s) < 60) return 'ahora mismo'
  const m = Math.round(s / 60)
  if (Math.abs(m) < 60) return rtf.format(m, 'minute')
  const h = Math.round(m / 60)
  if (Math.abs(h) < 24) return rtf.format(h, 'hour')
  return rtf.format(Math.round(h / 24), 'day')
}

/**
 * Plantillas publicadas junto a la app (templates/index.json). Permiten
 * ofrecer proyectos grandes, con imágenes, sin meterlos en el código.
 */
interface RemoteTemplate {
  id: string
  name: string
  description: string
  kind: ProjectKind
  project: string
  cover?: string
  screens?: number
  modes?: { name: string; color: string }[]
}

function useRemoteTemplates() {
  const [list, setList] = useState<RemoteTemplate[]>([])
  useEffect(() => {
    let alive = true
    fetch('templates/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates?: RemoteTemplate[] } | null) => {
        if (alive && d && Array.isArray(d.templates)) setList(d.templates)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return list
}

async function openRemoteTemplate(t: RemoteTemplate) {
  try {
    const res = await fetch(t.project)
    if (!res.ok) throw new Error(String(res.status))
    const project = parseProject(await res.json())
    project.name = t.name
    const id = addProject(project)
    openProject(id)
  } catch {
    toast('No se pudo cargar la plantilla. Vuelve a intentarlo.', 'error')
  }
}

type Filter = 'all' | 'app' | 'web' | 'modes'
type Section = 'projects' | 'templates'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'app', label: 'Apps' },
  { value: 'web', label: 'Webs' },
  { value: 'modes', label: 'Con modos' },
]

export function Home() {
  const projects = useStore((s) => s.projects)
  const order = useStore((s) => s.order)
  const remote = useRemoteTemplates()
  const [section, setSection] = useState<Section>('projects')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [creating, setCreating] = useState<ProjectKind | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<Project | null>(null)

  const list = order
    .map((id) => projects[id])
    .filter((p): p is Project => !!p)
    .filter((p) => (filter === 'all' ? true : filter === 'modes' ? p.modes.length > 1 : p.kind === filter))
    .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))

  const go = (s: Section) => {
    setSection(s)
    setSideOpen(false)
  }

  return (
    <div className="home">
      <aside className={`side${sideOpen ? ' open' : ''}`} aria-label="Navegación">
        <div className="side-brand">
          <HiloMark size={26} />
          <span className="brand-name">Hilo</span>
        </div>
        <nav className="side-nav">
          <button className={`side-item${section === 'projects' ? ' on' : ''}`} onClick={() => go('projects')}>
            <Icon name="layers" size={16} />
            <span>Todos los proyectos</span>
            <span className="side-count">{order.length}</span>
          </button>
          <button className={`side-item${section === 'templates' ? ' on' : ''}`} onClick={() => go('templates')}>
            <Icon name="grid" size={16} />
            <span>Plantillas</span>
            <span className="side-count">{TEMPLATES.length + remote.length}</span>
          </button>
        </nav>
        <div className="side-label">Recientes</div>
        <ul className="side-projects">
          {order.slice(0, 8).map((id) => {
            const p = projects[id]
            if (!p) return null
            return (
              <li key={id}>
                <button className="side-item" onClick={() => openProject(id)} title={p.name}>
                  <span className="side-letter">{p.name.trim().charAt(0).toUpperCase() || '?'}</span>
                  <span className="side-name">{p.name}</span>
                  <Icon name="chevron-right" size={14} className="side-chev" />
                </button>
              </li>
            )
          })}
        </ul>
        <button className="side-item muted" onClick={() => setCreating('app')}>
          <Icon name="plus" size={16} />
          <span>Nuevo proyecto</span>
        </button>
        <div className="side-spacer" />
        <div className="side-foot">
          <button className="side-item muted" onClick={() => setImporting(true)}>
            <Icon name="upload" size={16} />
            <span>Importar</span>
          </button>
        </div>
      </aside>
      {sideOpen && <div className="side-scrim" onClick={() => setSideOpen(false)} />}

      <main className="home-main">
        <header className="home-top">
          <button className="icon-btn side-toggle" onClick={() => setSideOpen(true)} aria-label="Abrir navegación">
            <Icon name="menu" size={18} />
          </button>
          <h1 className="home-title">{section === 'projects' ? 'Proyectos' : 'Plantillas'}</h1>
          {section === 'projects' && (
            <div className="view-tabs" role="tablist" aria-label="Vista">
              <button role="tab" aria-selected={view === 'grid'} className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>
                Cuadrícula
              </button>
              <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                Lista
              </button>
            </div>
          )}
        </header>
        <p className="home-sub">
          {section === 'projects'
            ? 'Diseña apps y webs, conecta sus flujos y pruébalos en cada modo.'
            : 'Empieza desde un proyecto de ejemplo con sus pantallas, flujos y modos.'}
        </p>

        {section === 'projects' ? (
          <>
            <div className="chip-row">
              <label className="search-chip">
                <Icon name="search" size={14} />
                <input
                  id="project-search"
                  placeholder="Buscar proyectos…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  className={`chip${filter === f.value ? ' on' : ''}`}
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {list.length === 0 ? (
              <div className="empty">
                <p>{order.length === 0 ? 'Todavía no tienes proyectos.' : 'Ningún proyecto coincide con la búsqueda.'}</p>
                <div className="btn-row">
                  <button className="btn primary" onClick={() => setCreating('app')}>
                    <Icon name="plus" size={14} /> Nueva app
                  </button>
                  <button className="btn" onClick={() => setCreating('web')}>
                    <Icon name="globe" size={14} /> Nueva web
                  </button>
                </div>
              </div>
            ) : view === 'grid' ? (
              <div className="project-grid">
                {list.map((p) => (
                  <ProjectCard key={p.id} project={p} onDelete={() => setConfirmDelete(p)} onRename={() => setRenaming(p)} />
                ))}
              </div>
            ) : (
              <div className="project-list" role="table">
                <div className="pl-row pl-head" role="row">
                  <span role="columnheader">Nombre</span>
                  <span role="columnheader">Tipo</span>
                  <span role="columnheader">Pantallas</span>
                  <span role="columnheader">Modos</span>
                  <span role="columnheader">Editado</span>
                </div>
                {list.map((p) => (
                  <button key={p.id} className="pl-row" role="row" onClick={() => openProject(p.id)}>
                    <span className="pl-name" role="cell">
                      <span className="side-letter">{p.name.trim().charAt(0).toUpperCase()}</span>
                      {p.name}
                    </span>
                    <span role="cell">{p.kind === 'app' ? 'App' : 'Web'}</span>
                    <span role="cell" className="num">{p.screens.length}</span>
                    <span role="cell">
                      <ModeDots modes={p.modes} />
                    </span>
                    <span role="cell" className="muted">{ago(p.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}

            <section className="home-section">
              <h2>Empieza con un ejemplo</h2>
              <TemplateGrid remote={remote} compact />
            </section>
          </>
        ) : (
          <TemplateGrid remote={remote} />
        )}
      </main>

      <button className="fab" onClick={() => setCreating('app')} title="Nuevo proyecto" aria-label="Nuevo proyecto">
        <Icon name="plus" size={24} strokeWidth={2.4} />
      </button>

      {creating && <NewProjectDialog kind={creating} onClose={() => setCreating(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {confirmDelete && (
        <Dialog
          title="Eliminar proyecto"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button
                className="btn danger solid"
                onClick={() => {
                  deleteProject(confirmDelete.id)
                  setConfirmDelete(null)
                  toast(`«${confirmDelete.name}» eliminado`)
                }}
              >
                Eliminar
              </button>
            </>
          }
        >
          <p>
            Se eliminará <b>{confirmDelete.name}</b> con sus {confirmDelete.screens.length} pantallas. Esta acción no se puede
            deshacer.
          </p>
        </Dialog>
      )}
      {renaming && <RenameDialog project={renaming} onClose={() => setRenaming(null)} />}
    </div>
  )
}

function ModeDots({ modes }: { modes: { id?: string; name: string; color: string }[] }) {
  return (
    <span className="mode-dots" title={modes.map((m) => m.name).join(' · ')}>
      {modes.slice(0, 6).map((m, i) => (
        <span key={m.id ?? i} className="mode-dot" style={{ '--mode': m.color } as CSSProperties} />
      ))}
      {modes.length > 1 && <span className="mode-dots-n">{modes.length}</span>}
    </span>
  )
}

function TemplateGrid({ remote, compact }: { remote: RemoteTemplate[]; compact?: boolean }) {
  const previews = useMemo(() => TEMPLATES.map((t) => ({ t, p: t.build() })), [])
  return (
    <div className={`tpl-grid${compact ? ' compact' : ''}`}>
      {remote.map((t) => (
        <button key={t.id} className="tpl-card" onClick={() => openRemoteTemplate(t)}>
          <div className="tpl-thumb">{t.cover && <img src={t.cover} alt="" loading="lazy" />}</div>
          <div className="tpl-body">
            <b>{t.name}</b>
            <span className="tpl-desc">{t.description}</span>
            {t.modes && (
              <span className="tpl-modes">
                {t.modes.map((m) => (
                  <span key={m.name} className="mode-pill" style={{ '--mode': m.color } as CSSProperties}>
                    {m.name}
                  </span>
                ))}
              </span>
            )}
          </div>
        </button>
      ))}
      {previews.map(({ t, p }) => (
        <button
          key={t.id}
          className="tpl-card"
          onClick={() => {
            const id = newFromTemplate(t.id)
            if (id) openProject(id)
          }}
        >
          <div className="tpl-thumb">
            {p.screens.slice(0, t.kind === 'app' ? 3 : 1).map((s) => (
              <ScreenThumb
                key={s.id}
                screen={s}
                modeId={p.modes[p.modes.length - 1].id}
                width={t.kind === 'app' ? 74 : 230}
                height={150}
              />
            ))}
          </div>
          <div className="tpl-body">
            <b>{t.name}</b>
            <span className="tpl-desc">{t.description}</span>
            <span className="tpl-modes">
              {p.modes.map((m) => (
                <span key={m.id} className="mode-pill" style={{ '--mode': m.color } as CSSProperties}>
                  {m.name}
                </span>
              ))}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function ProjectCard({ project, onDelete, onRename }: { project: Project; onDelete: () => void; onRename: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const start = project.screens.find((s) => s.id === project.startScreenId) ?? project.screens[0]
  const items: MenuEntry[] = [
    { label: 'Abrir', icon: 'arrow-right', onSelect: () => openProject(project.id) },
    { label: 'Renombrar', icon: 'edit', onSelect: onRename },
    { label: 'Duplicar', icon: 'copy', onSelect: () => duplicateProject(project.id) },
    'separator',
    // Algunos entornos embebidos bloquean las descargas; ahí solo se ofrece copiar.
    ...(import.meta.env.VITE_NO_DOWNLOAD !== '1'
      ? [{ label: 'Descargar .json', icon: 'download', onSelect: () => downloadProject(project) }]
      : []),
    { label: 'Copiar como JSON', icon: 'copy', onSelect: () => copyProject(project) },
    'separator',
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: onDelete },
  ]
  return (
    <div className="project-card">
      <button className="project-open" onClick={() => openProject(project.id)} aria-label={`Abrir ${project.name}`}>
        <div className="project-thumb">
          {start ? (
            <ScreenThumb screen={start} modeId={project.modes[0].id} width={project.kind === 'app' ? 112 : 250} height={146} />
          ) : (
            <span className="muted">Sin pantallas</span>
          )}
        </div>
      </button>
      <div className="project-info">
        <div className="project-text">
          <b>{project.name}</b>
          <span className="project-meta">
            <span className="kind-tag">{project.kind === 'app' ? 'App' : 'Web'}</span>
            <span>{project.screens.length} pantallas</span>
            <ModeDots modes={project.modes} />
            <span className="muted">{ago(project.updatedAt)}</span>
          </span>
        </div>
        <button
          className="icon-btn"
          title="Más opciones"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.right - 200, y: r.bottom + 4 })
          }}
        >
          <Icon name="more" size={18} strokeWidth={3} />
        </button>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function exportJson(project: Project) {
  return JSON.stringify({ format: 'hilo', version: 1, project }, null, 2)
}

function downloadProject(project: Project) {
  try {
    const blob = new Blob([exportJson(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.hilo.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    toast('No se pudo descargar. Usa «Copiar como JSON».', 'error')
  }
}

function copyProject(project: Project) {
  navigator.clipboard
    ?.writeText(exportJson(project))
    .then(() => toast('Proyecto copiado como JSON'))
    .catch(() => toast('El navegador no permitió copiar. Prueba a descargarlo.', 'error'))
}

function NewProjectDialog({ kind: initialKind, onClose }: { kind: ProjectKind; onClose: () => void }) {
  const [kind, setKind] = useState<ProjectKind>(initialKind)
  const [name, setName] = useState('')
  const [modes, setModes] = useState('')
  const create = () => {
    const id = newProject(name.trim() || (kind === 'app' ? 'Nueva app' : 'Nueva web'), kind)
    const names = modes
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    if (names.length) {
      const p = useStore.getState().projects[id]
      useStore.setState((s) => ({
        projects: { ...s.projects, [id]: { ...p, modes: names.map((n, i) => createMode(n, i)) } },
      }))
    }
    onClose()
    openProject(id)
  }
  return (
    <Dialog
      title="Nuevo proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={create}>
            Crear proyecto
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <label className="form-field" htmlFor="np-name">
          <span>Nombre</span>
          <input
            id="np-name"
            className="text-input"
            autoFocus
            placeholder={kind === 'app' ? 'Mi app' : 'Mi web'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-field">
          <span>Tipo</span>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'app', label: 'App móvil', icon: 'smartphone' },
              { value: 'web', label: 'Web', icon: 'globe' },
            ]}
          />
        </div>
        <label className="form-field" htmlFor="np-modes">
          <span>Modos (opcional)</span>
          <input
            id="np-modes"
            className="text-input"
            placeholder="Básico, Pro, Premium"
            value={modes}
            onChange={(e) => setModes(e.target.value)}
          />
          <small className="muted">
            Sepáralos con comas. Sirven para planes, roles o variantes: cada pantalla puede cambiar según el modo.
          </small>
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function RenameDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name)
  const save = () => {
    renameProject(project.id, name)
    onClose()
  }
  return (
    <Dialog
      title="Renombrar proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Guardar
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          id="rename-project"
          className="text-input"
          autoFocus
          value={name}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  )
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const load = (raw: string) => {
    try {
      const project = parseProject(JSON.parse(raw))
      const id = addProject(project)
      onClose()
      toast(`«${project.name}» importado`)
      openProject(id)
    } catch (err) {
      setError(err instanceof SyntaxError ? 'El texto no es un JSON válido.' : (err as Error).message)
    }
  }
  return (
    <Dialog
      title="Importar proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => load(text)}>
            Importar
          </button>
        </>
      }
    >
      <div className="form">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> Elegir archivo .json
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) load(await f.text())
          }}
        />
        <label className="form-field" htmlFor="import-text">
          <span>O pega aquí el JSON exportado</span>
          <textarea
            id="import-text"
            className="text-area mono"
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
      </div>
    </Dialog>
  )
}

