import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { createMode } from '../model/defaults'
import { parseProject } from '../model/project'
import { TEMPLATES } from '../model/templates'
import type { Project, ProjectKind } from '../model/types'
import { ScreenThumb } from '../render/ElementView'
import { Icon } from '../render/icons'
import { Dialog, Menu, Segmented, type MenuEntry } from '../ui/controls'
import { PulseMark } from '../editor/TopBar'
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

export function Home() {
  const projects = useStore((s) => s.projects)
  const order = useStore((s) => s.order)
  const [creating, setCreating] = useState<ProjectKind | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<Project | null>(null)
  const templatePreviews = useMemo(() => TEMPLATES.map((t) => ({ t, p: t.build() })), [])

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <PulseMark size={30} />
          <span className="brand-name">Pulso</span>
        </div>
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={14} /> Importar
        </button>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h1>Diseña apps y webs, conecta sus flujos y pruébalas en cada modo.</h1>
          <p className="lead">
            Un lienzo infinito para tus pantallas. Dibuja, une cada botón con su destino y pulsa ▶ en cualquier pantalla
            para probarla. Con los modos ves cómo cambia el producto según el plan, el rol o lo que necesites.
          </p>
          <div className="new-row">
            <button className="new-card" onClick={() => setCreating('app')}>
              <span className="new-icon">
                <Icon name="smartphone" size={22} />
              </span>
              <span>
                <b>Nueva app</b>
                <small>Pantallas de 393 × 852</small>
              </span>
            </button>
            <button className="new-card" onClick={() => setCreating('web')}>
              <span className="new-icon">
                <Icon name="globe" size={22} />
              </span>
              <span>
                <b>Nueva web</b>
                <small>Pantallas de 1440 × 1024</small>
              </span>
            </button>
          </div>
        </section>

        <section className="home-section">
          <h2>Empieza con un ejemplo</h2>
          <div className="tpl-grid">
            {templatePreviews.map(({ t, p }) => {
              return (
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
                      <ScreenThumb key={s.id} screen={s} modeId={p.modes[p.modes.length - 1].id} width={t.kind === 'app' ? 74 : 230} height={150} />
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
              )
            })}
          </div>
        </section>

        <section className="home-section">
          <h2>
            Tus proyectos <span className="count">{order.length}</span>
          </h2>
          {order.length === 0 ? (
            <p className="muted">Todavía no tienes proyectos. Crea una app o una web, o empieza con un ejemplo.</p>
          ) : (
            <div className="project-grid">
              {order.map((id) => projects[id] && (
                <ProjectCard
                  key={id}
                  project={projects[id]}
                  onDelete={() => setConfirmDelete(projects[id])}
                  onRename={() => setRenaming(projects[id])}
                />
              ))}
            </div>
          )}
        </section>
      </main>

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

function ProjectCard({ project, onDelete, onRename }: { project: Project; onDelete: () => void; onRename: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const start = project.screens.find((s) => s.id === project.startScreenId) ?? project.screens[0]
  const items: MenuEntry[] = [
    { label: 'Abrir', icon: 'arrow-right', onSelect: () => openProject(project.id) },
    { label: 'Renombrar', icon: 'edit', onSelect: onRename },
    { label: 'Duplicar', icon: 'copy', onSelect: () => duplicateProject(project.id) },
    'separator',
    { label: 'Descargar .json', icon: 'download', onSelect: () => downloadProject(project) },
    { label: 'Copiar como JSON', icon: 'copy', onSelect: () => copyProject(project) },
    'separator',
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: onDelete },
  ]
  return (
    <div className="project-card">
      <button className="project-open" onClick={() => openProject(project.id)} aria-label={`Abrir ${project.name}`}>
        <div className="project-thumb">
          {start ? (
            <ScreenThumb screen={start} modeId={project.modes[0].id} width={project.kind === 'app' ? 120 : 260} height={150} />
          ) : (
            <span className="muted">Sin pantallas</span>
          )}
        </div>
      </button>
      <div className="project-info">
        <div className="project-text">
          <b>{project.name}</b>
          <span className="muted small">
            {project.kind === 'app' ? 'App' : 'Web'} · {project.screens.length} pantallas · {project.modes.length}{' '}
            {project.modes.length === 1 ? 'modo' : 'modos'} · {ago(project.updatedAt)}
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
  return JSON.stringify({ format: 'pulso', version: 1, project }, null, 2)
}

function downloadProject(project: Project) {
  try {
    const blob = new Blob([exportJson(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.pulso.json`
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

