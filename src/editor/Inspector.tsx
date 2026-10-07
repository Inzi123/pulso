import { createContext, useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DEVICE_PRESETS, FONT_FAMILIES, MODE_COLORS, TYPE_LABELS } from '../model/defaults'
import { unionRects } from '../model/geometry'
import { computeFlows } from '../model/flows'
import { isOverridden, isScreenAvailable, overriddenKeys, PROP_LABELS, resolveProps, setVisibleInMode } from '../model/modes'
import { findScreen, screenRect, screensInside } from '../model/project'
import type {
  DesignElement,
  ElementProps,
  InteractionAction,
  Mode,
  Project,
  PropKey,
  Screen,
  Section as CanvasSection,
  Transition,
} from '../model/types'
import { DESIGN_ICONS, Icon } from '../render/icons'
import { ColorField, NumberField, Segmented, Select, TextField, Toggle } from '../ui/controls'
import {
  alignSelection,
  deleteSelection,
  duplicateSelection,
  mutate,
  play,
  resetOverrides,
  setScreenAvailability,
  setStartScreen,
  setState,
  toast,
  updateElements,
  updateScreen,
  updateSection,
  useStore,
  type AlignKind,
} from '../store/store'

export function Inspector({ project }: { project: Project }) {
  const selection = useStore((s) => s.selection)
  const modeId = useStore((s) => s.modeId)
  const mode = project.modes.find((m) => m.id === modeId)!

  let body: ReactNode
  if (selection.kind === 'section') {
    const sec = project.sections?.find((x) => x.id === selection.id)
    body = sec ? <SectionInspector project={project} section={sec} /> : null
  } else if (selection.kind === 'elements') {
    const screen = findScreen(project, selection.screenId)
    const els = screen?.elements.filter((e) => selection.ids.includes(e.id)) ?? []
    body = screen && els.length ? <ElementInspector project={project} screen={screen} els={els} mode={mode} /> : null
  } else if (selection.kind === 'screens') {
    const screens = project.screens.filter((s) => selection.ids.includes(s.id))
    body =
      screens.length === 1 ? (
        <ScreenInspector project={project} screen={screens[0]} mode={mode} />
      ) : (
        <MultiScreens count={screens.length} />
      )
  } else {
    body = <ProjectInspector project={project} mode={mode} />
  }
  return (
    <aside className="panel panel-right" aria-label="Propiedades">
      {body}
    </aside>
  )
}

/* ---------- Piezas comunes ---------- */

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="insp-section">
      <header className="insp-head">
        <h4>{title}</h4>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Etiqueta con marca de "cambia en este modo" y botón para restablecer. */
function Label({
  children,
  overridden,
  mode,
  onReset,
}: {
  children: ReactNode
  overridden?: boolean
  mode?: Mode
  onReset?: () => void
}) {
  return (
    <span className="insp-label">
      {children}
      {overridden && mode && (
        <button
          className="ov-mark"
          style={{ '--mode': mode.color } as CSSProperties}
          onClick={onReset}
          title={`Cambia en ${mode.name}. Clic para volver al valor compartido.`}
        >
          <span className="ov-dot" />
          <Icon name="reset" size={10} />
        </button>
      )}
    </span>
  )
}

function common<T>(values: T[]): T | null {
  if (values.length === 0) return null
  const first = JSON.stringify(values[0])
  return values.every((v) => JSON.stringify(v) === first) ? values[0] : null
}

function ModeBanner({ project, mode, changed, onReset }: { project: Project; mode: Mode; changed: number; onReset?: () => void }) {
  const scope = useStore((s) => s.scope)
  if (project.modes.length < 2) return null
  return (
    <div className="mode-banner" style={{ '--mode': mode.color } as CSSProperties}>
      <span className="mode-dot" />
      <div className="mode-banner-text">
        <b>{mode.name}</b>
        <span>{scope === 'mode' ? 'Los cambios solo afectan a este modo' : 'Los cambios afectan a todos los modos'}</span>
      </div>
      {changed > 0 && onReset && (
        <button className="link-btn" onClick={onReset} title="Quitar los cambios de este modo">
          Restablecer ({changed})
        </button>
      )}
    </div>
  )
}

/* ---------- Proyecto (sin selección) ---------- */

function ProjectInspector({ project, mode }: { project: Project; mode: Mode }) {
  const flows = computeFlows(project, mode.id)
  const available = project.screens.filter((s) => isScreenAvailable(s, mode.id))
  return (
    <div className="insp">
      <div className="insp-title">
        <Icon name={project.kind === 'app' ? 'smartphone' : 'globe'} size={14} />
        <span>Proyecto</span>
      </div>
      <Section title="Resumen">
        <dl className="stats">
          <div>
            <dt>Pantallas</dt>
            <dd>{project.screens.length}</dd>
          </div>
          <div>
            <dt>Modos</dt>
            <dd>{project.modes.length}</dd>
          </div>
          <div>
            <dt>Flujos</dt>
            <dd>{flows.length}</dd>
          </div>
        </dl>
        {project.modes.length > 1 && (
          <p className="muted small">
            En <b>{mode.name}</b> existen {available.length} de {project.screens.length} pantallas.
          </p>
        )}
      </Section>
      <Section title="Prototipo">
        <div className="row">
          <Label>Inicio</Label>
          <Select
            value={project.startScreenId ?? ''}
            onChange={(v) => setStartScreen(v || null)}
            options={[{ value: '', label: 'Primera disponible' }, ...project.screens.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </div>
        <div className="row">
          <Label>Tipo</Label>
          <Segmented
            value={project.kind}
            onChange={(kind) => mutate((d) => void (d.kind = kind))}
            options={[
              { value: 'app', label: 'App', icon: 'smartphone' },
              { value: 'web', label: 'Web', icon: 'globe' },
            ]}
          />
        </div>
        <div className="grid2">
          <NumberField
            label="Alto"
            title="Alto visible del dispositivo en el prototipo. Las pantallas más altas hacen scroll."
            value={project.viewportHeight}
            min={200}
            max={4000}
            onChange={(v) => mutate((d) => void (d.viewportHeight = v), true, 'viewport')}
          />
        </div>
        <button className="btn primary full" onClick={() => play()}>
          <Icon name="play" size={13} strokeWidth={2.2} /> Probar desde el inicio
        </button>
      </Section>
      <Section title="Cómo se usa">
        <ul className="tips">
          <li>
            <b>Crea pantallas</b> con la herramienta Pantalla (F) y dibuja elementos dentro.
          </li>
          <li>
            <b>Conecta flujos</b>: selecciona un elemento y arrastra el círculo azul hasta otra pantalla.
          </li>
          <li>
            <b>Modos</b>: cambia de modo arriba. Con «Editando solo…» (E) tus cambios afectan únicamente a ese modo.
          </li>
          <li>
            <b>Prueba</b> cualquier pantalla con el botón ▶ de su nombre o con {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Intro.
          </li>
        </ul>
      </Section>
    </div>
  )
}

function MultiScreens({ count }: { count: number }) {
  return (
    <div className="insp">
      <div className="insp-title">
        <Icon name="frame" size={14} />
        <span>{count} pantallas</span>
      </div>
      <Section title="Acciones">
        <div className="btn-row">
          <button className="btn" onClick={duplicateSelection}>
            <Icon name="copy" size={13} /> Duplicar
          </button>
          <button className="btn danger" onClick={deleteSelection}>
            <Icon name="trash" size={13} /> Eliminar
          </button>
        </div>
      </Section>
    </div>
  )
}

/* ---------- Sección ---------- */

function SectionInspector({ project, section }: { project: Project; section: CanvasSection }) {
  const inside = screensInside(project, section)
  const key = `section:${section.id}`
  return (
    <div className="insp">
      <div className="insp-title">
        <Icon name="frame" size={14} />
        <TextField className="title-input small" value={section.name} onCommit={(v) => v.trim() && updateSection(section.id, { name: v.trim() })} />
      </div>
      <Section title="Contenido">
        <p className="muted small">
          {inside.length} {inside.length === 1 ? 'pantalla' : 'pantallas'} dentro. Arrastra el título para mover la sección con
          sus pantallas.
        </p>
        {inside.length > 0 && (
          <button
            className="link-btn"
            onClick={() => {
              const b = unionRects(inside.map(screenRect))!
              updateSection(section.id, { x: b.x - 80, y: b.y - 130, width: b.width + 160, height: b.height + 210 })
            }}
          >
            Ajustar a sus pantallas
          </button>
        )}
      </Section>
      <Section title="Color">
        <div className="swatch-row">
          {MODE_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch-btn${section.color === c ? ' on' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => updateSection(section.id, { color: c })}
            />
          ))}
        </div>
      </Section>
      <Section title="Posición y tamaño">
        <div className="grid2">
          <NumberField label="X" value={section.x} onChange={(v) => updateSection(section.id, { x: v }, true, `${key}:x`)} />
          <NumberField label="Y" value={section.y} onChange={(v) => updateSection(section.id, { y: v }, true, `${key}:y`)} />
          <NumberField label="An" min={100} value={section.width} onChange={(v) => updateSection(section.id, { width: v }, true, `${key}:w`)} />
          <NumberField label="Al" min={100} value={section.height} onChange={(v) => updateSection(section.id, { height: v }, true, `${key}:h`)} />
        </div>
      </Section>
      <Section title="Acciones">
        <button className="btn danger" onClick={deleteSelection}>
          <Icon name="trash" size={13} /> Eliminar sección
        </button>
        <p className="muted small">Las pantallas se quedan donde están.</p>
      </Section>
    </div>
  )
}

/* ---------- Pantalla ---------- */

function ScreenInspector({ project, screen, mode }: { project: Project; screen: Screen; mode: Mode }) {
  const preset = DEVICE_PRESETS.find((d) => d.width === screen.width && d.height === screen.height)
  const flows = computeFlows(project, mode.id)
  const outgoing = flows.filter((f) => f.fromScreenId === screen.id).length
  const incoming = flows.filter((f) => f.toScreenId === screen.id).length
  const changes = screen.elements.filter((e) => e.overrides[mode.id]).length
  const key = `screen:${screen.id}`
  return (
    <div className="insp">
      <div className="insp-title">
        <Icon name="frame" size={14} />
        <TextField className="title-input small" value={screen.name} onCommit={(v) => v.trim() && updateScreen(screen.id, { name: v.trim() })} />
      </div>
      <div className="insp-actions">
        <button className="btn primary" onClick={() => play(screen.id)} disabled={!isScreenAvailable(screen, mode.id)}>
          <Icon name="play" size={13} strokeWidth={2.2} /> Probar aquí
        </button>
        {project.modes.length > 1 && (
          <button className="btn" onClick={() => setState({ compareScreenId: screen.id })}>
            <Icon name="compare" size={13} /> Comparar modos
          </button>
        )}
      </div>

      {project.modes.length > 1 && (
        <Section title="Existe en">
          <ModeChips
            modes={project.modes}
            isOn={(m) => isScreenAvailable(screen, m.id)}
            onToggle={(m, on) => setScreenAvailability(screen.id, m.id, on)}
          />
          {changes > 0 && (
            <p className="muted small">
              {changes} {changes === 1 ? 'elemento cambia' : 'elementos cambian'} en {mode.name}.
            </p>
          )}
        </Section>
      )}

      <Section title="Tamaño">
        <div className="row">
          <Label>Dispositivo</Label>
          <Select
            value={preset?.id ?? 'custom'}
            onChange={(id) => {
              const d = DEVICE_PRESETS.find((x) => x.id === id)
              if (d) updateScreen(screen.id, { width: d.width, height: d.height })
            }}
            options={[
              ...DEVICE_PRESETS.map((d) => ({ value: d.id, label: `${d.label} · ${d.width}×${d.height}` })),
              { value: 'custom', label: 'Personalizado', disabled: true },
            ]}
          />
        </div>
        <div className="grid2">
          <NumberField label="X" value={screen.x} onChange={(v) => updateScreen(screen.id, { x: v }, true, `${key}:x`)} />
          <NumberField label="Y" value={screen.y} onChange={(v) => updateScreen(screen.id, { y: v }, true, `${key}:y`)} />
          <NumberField label="An" title="Ancho" min={40} value={screen.width} onChange={(v) => updateScreen(screen.id, { width: v }, true, `${key}:w`)} />
          <NumberField label="Al" title="Alto" min={40} value={screen.height} onChange={(v) => updateScreen(screen.id, { height: v }, true, `${key}:h`)} />
        </div>
        <button
          className="link-btn"
          onClick={() => {
            const bottom = Math.max(screen.height, ...screen.elements.map((e) => {
              const p = resolveProps(e, mode.id)
              return p.hidden ? 0 : p.y + p.height
            }))
            updateScreen(screen.id, { height: Math.ceil(bottom) })
          }}
        >
          Ajustar alto al contenido
        </button>
      </Section>

      <Section title="Fondo">
        <ColorField value={screen.fill} allowEmpty onChange={(v) => updateScreen(screen.id, { fill: v }, true, `${key}:fill`)} />
      </Section>

      <Section title="Prototipo">
        <Toggle
          id={`start-${screen.id}`}
          checked={project.startScreenId === screen.id}
          onChange={(on) => setStartScreen(on ? screen.id : null)}
          label="Pantalla de inicio"
        />
        <Toggle
          id={`auto-${screen.id}`}
          checked={!!screen.autoAdvance}
          onChange={(on) =>
            updateScreen(screen.id, {
              autoAdvance: on ? { target: null, delay: 2500, transition: 'dissolve' } : null,
            })
          }
          label="Avanzar sola tras un tiempo"
        />
        {screen.autoAdvance && (
          <>
            <div className="row">
              <Label>Destino</Label>
              <Select
                value={screen.autoAdvance.target ?? ''}
                onChange={(v) => updateScreen(screen.id, { autoAdvance: { ...screen.autoAdvance!, target: v || null } })}
                options={[
                  { value: '', label: 'Elige una pantalla…' },
                  ...project.screens.filter((s) => s.id !== screen.id).map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
            <div className="grid2">
              <NumberField
                label="ms"
                title="Tiempo antes de avanzar"
                value={screen.autoAdvance.delay}
                min={0}
                max={60000}
                step={100}
                onChange={(v) => updateScreen(screen.id, { autoAdvance: { ...screen.autoAdvance!, delay: v } }, true, `${key}:delay`)}
              />
              <Select
                value={screen.autoAdvance.transition}
                onChange={(v) => updateScreen(screen.id, { autoAdvance: { ...screen.autoAdvance!, transition: v } })}
                options={TRANSITIONS}
              />
            </div>
          </>
        )}
        <p className="muted small">
          {outgoing} {outgoing === 1 ? 'flujo sale' : 'flujos salen'} de aquí y {incoming} {incoming === 1 ? 'llega' : 'llegan'}
          {project.modes.length > 1 ? ` en ${mode.name}` : ''}.
        </p>
      </Section>
    </div>
  )
}

function ModeChips({
  modes,
  isOn,
  onToggle,
}: {
  modes: Mode[]
  isOn: (m: Mode) => boolean
  onToggle: (m: Mode, on: boolean) => void
}) {
  return (
    <div className="mode-chips">
      {modes.map((m) => {
        const on = isOn(m)
        return (
          <button
            key={m.id}
            className={`mode-chip${on ? ' on' : ''}`}
            style={{ '--mode': m.color } as CSSProperties}
            onClick={() => onToggle(m, !on)}
            aria-pressed={on}
          >
            <Icon name={on ? 'check' : 'x'} size={11} strokeWidth={2.6} />
            {m.name}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Elementos ---------- */

function ElementInspector({ project, screen, els, mode }: { project: Project; screen: Screen; els: DesignElement[]; mode: Mode }) {
  const tab = useStore((s) => s.inspectorTab)
  const ids = els.map((e) => e.id)
  const props = els.map((e) => resolveProps(e, mode.id))
  const first = props[0]
  const types = new Set(els.map((e) => e.type))
  const only = types.size === 1 ? els[0].type : null
  const changed = els.filter((e) => overriddenKeys(e, mode.id).length > 0).length
  const multiMode = project.modes.length > 1

  const ov = (key: PropKey) => multiMode && els.some((e) => isOverridden(e, mode.id, key))
  const reset = (...keys: PropKey[]) => resetOverrides(screen.id, ids, keys)
  const set = (patch: Partial<ElementProps>, coalesce?: string) =>
    updateElements(screen.id, ids, patch, true, coalesce ? `${ids.join(',')}:${coalesce}` : undefined)
  const num = (key: PropKey) => common(props.map((p) => p[key] as number))
  const hasText = [...types].every((t) => t === 'text' || t === 'button' || t === 'input')
  const title = els.length === 1 ? els[0].name : `${els.length} elementos`

  return (
    <PropCtx.Provider value={{ els, mode, screenId: screen.id, multiMode }}>
    <div className="insp">
      <div className="insp-title">
        <Icon name={only === 'text' ? 'type' : only === 'image' ? 'image-icon' : only === 'icon' ? 'star' : 'square'} size={14} />
        <span className="insp-name">{title}</span>
        <span className="muted small">{only ? TYPE_LABELS[only] : 'Varios'}</span>
      </div>
      <Segmented
        className="insp-tabs"
        value={tab}
        onChange={(t) => setState({ inspectorTab: t })}
        options={[
          { value: 'design', label: 'Diseño' },
          { value: 'prototype', label: 'Prototipo' },
        ]}
      />
      <ModeBanner project={project} mode={mode} changed={changed} onReset={() => resetOverrides(screen.id, ids)} />

      {tab === 'prototype' ? (
        <PrototypeSection project={project} screen={screen} els={els} mode={mode} />
      ) : (
        <>
          {multiMode && (
            <Section title="Visible en">
              <ModeChips
                modes={project.modes}
                isOn={(m) => els.every((e) => !resolveProps(e, m.id).hidden)}
                onToggle={(m, on) =>
                  mutate((d) => {
                    const s = d.screens.find((x) => x.id === screen.id)
                    if (!s) return
                    for (const el of s.elements) {
                      if (ids.includes(el.id)) setVisibleInMode(el as DesignElement, m.id, on, project.modes.map((x) => x.id))
                    }
                  })
                }
              />
            </Section>
          )}

          <Section title="Posición y tamaño">
            <AlignRow />
            <div className="grid2">
              <NumberField label="X" value={num('x')} onChange={(v) => set({ x: v }, 'x')} />
              <NumberField label="Y" value={num('y')} onChange={(v) => set({ y: v }, 'y')} />
              <NumberField label="An" title="Ancho" min={1} value={num('width')} onChange={(v) => set({ width: v }, 'w')} />
              <NumberField label="Al" title="Alto" min={1} value={num('height')} onChange={(v) => set({ height: v }, 'h')} />
            </div>
            {(ov('x') || ov('y') || ov('width') || ov('height')) && (
              <div className="ov-note" style={{ '--mode': mode.color } as CSSProperties}>
                <span className="ov-dot" /> Posición o tamaño propios en {mode.name}
                <button className="link-btn" onClick={() => reset('x', 'y', 'width', 'height')}>
                  Restablecer
                </button>
              </div>
            )}
          </Section>

          <Section title="Capa">
            <div className="grid2">
              <div className="field-col">
                <L k="opacity">Opacidad</L>
                <NumberField
                  label="%"
                  value={common(props.map((p) => Math.round(p.opacity * 100)))}
                  min={0}
                  max={100}
                  onChange={(v) => set({ opacity: v / 100 }, 'opacity')}
                />
              </div>
              {only !== 'ellipse' && only !== 'icon' && (
                <div className="field-col">
                  <L k="radius">Radio</L>
                  <NumberField label="R" value={num('radius')} min={0} onChange={(v) => set({ radius: v }, 'radius')} />
                </div>
              )}
            </div>
            <div className="row">
              <L k="shadow">Sombra</L>
              <Select
                value={first.shadow}
                onChange={(v) => set({ shadow: v })}
                options={[
                  { value: 'none', label: 'Ninguna' },
                  { value: 'sm', label: 'Suave' },
                  { value: 'md', label: 'Media' },
                  { value: 'lg', label: 'Intensa' },
                ]}
              />
            </div>
            <div className="row">
              <Toggle
                id="fixed-toggle"
                checked={props.every((p) => p.fixed)}
                onChange={(v) => set({ fixed: v })}
                label="Fijo al hacer scroll"
              />
              <L k="fixed"> </L>
            </div>
          </Section>

          {only !== 'icon' && (
            <Section title="Relleno" action={<L k="fill"> </L>}>
              <ColorField value={first.fill} allowEmpty onChange={(v) => set({ fill: v }, 'fill')} />
            </Section>
          )}

          {only !== 'icon' && (
            <Section title="Borde" action={<L k={['stroke', 'strokeWidth']}> </L>}>
              <div className="stroke-row">
                <ColorField
                  value={first.stroke}
                  allowEmpty
                  onChange={(v) => set(v && first.strokeWidth === 0 ? { stroke: v, strokeWidth: 1 } : { stroke: v }, 'stroke')}
                />
                <NumberField label="px" value={num('strokeWidth')} min={0} max={40} precision={1} step={0.5} onChange={(v) => set({ strokeWidth: v }, 'sw')} />
              </div>
            </Section>
          )}

          {hasText && <TextSection els={els} props={props} set={set} />}

          {only === 'icon' && (
            <Section title="Icono" action={<L k={['icon', 'color']}> </L>}>
              <ColorField value={first.color} onChange={(v) => set({ color: v }, 'color')} />
              <div className="icon-grid">
                {DESIGN_ICONS.map((name) => (
                  <button
                    key={name}
                    className={`icon-pick${first.icon === name ? ' on' : ''}`}
                    onClick={() => set({ icon: name })}
                    title={name}
                  >
                    <Icon name={name} size={16} />
                  </button>
                ))}
              </div>
            </Section>
          )}

          {only === 'image' && <ImageSection value={first} set={set} />}

          <Section title="Acciones">
            <div className="btn-row">
              <button className="btn" onClick={duplicateSelection}>
                <Icon name="copy" size={13} /> Duplicar
              </button>
              <button className="btn danger" onClick={deleteSelection}>
                <Icon name="trash" size={13} /> Eliminar
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
    </PropCtx.Provider>
  )
}

const PropCtx = createContext<{ els: DesignElement[]; mode: Mode; screenId: string; multiMode: boolean } | null>(null)

/** Etiqueta de una propiedad que muestra si cambia en el modo activo. */
function L({ k, children }: { k: PropKey | PropKey[]; children: ReactNode }) {
  const ctx = useContext(PropCtx)!
  const keys = Array.isArray(k) ? k : [k]
  const overridden = ctx.multiMode && keys.some((key) => ctx.els.some((e) => isOverridden(e, ctx.mode.id, key)))
  return (
    <Label
      overridden={overridden}
      mode={ctx.mode}
      onReset={() => resetOverrides(ctx.screenId, ctx.els.map((e) => e.id), keys)}
    >
      {children}
    </Label>
  )
}

const ALIGN: { kind: AlignKind; icon: string; title: string }[] = [
  { kind: 'left', icon: 'align-left', title: 'Alinear a la izquierda' },
  { kind: 'hcenter', icon: 'align-hcenter', title: 'Centrar horizontalmente' },
  { kind: 'right', icon: 'align-right', title: 'Alinear a la derecha' },
  { kind: 'top', icon: 'align-top', title: 'Alinear arriba' },
  { kind: 'vcenter', icon: 'align-vcenter', title: 'Centrar verticalmente' },
  { kind: 'bottom', icon: 'align-bottom', title: 'Alinear abajo' },
]

function AlignRow() {
  return (
    <div className="align-row">
      {ALIGN.map((a) => (
        <button key={a.kind} className="icon-btn" title={a.title} onClick={() => alignSelection(a.kind)}>
          <Icon name={a.icon} size={15} />
        </button>
      ))}
    </div>
  )
}

type SetFn = (patch: Partial<ElementProps>, coalesce?: string) => void

function TextSection({ els, props, set }: { els: DesignElement[]; props: ElementProps[]; set: SetFn }) {
  const first = props[0]
  const placeholder = els.every((e) => e.type === 'input')
  return (
    <Section title={placeholder ? 'Texto de ejemplo' : 'Texto'} action={<L k="text"> </L>}>
      <textarea
        className="text-area"
        value={common(props.map((p) => p.text)) ?? ''}
        placeholder={common(props.map((p) => p.text)) === null ? 'Varios textos' : 'Escribe el texto'}
        rows={Math.min(6, Math.max(2, first.text.split('\n').length))}
        onChange={(e) => set({ text: e.target.value }, 'text')}
      />
      <div className="row">
        <L k="fontFamily">Fuente</L>
        <Select value={first.fontFamily} onChange={(v) => set({ fontFamily: v })} options={FONT_FAMILIES} />
      </div>
      <div className="grid2">
        <div className="field-col">
          <L k="fontSize">Tamaño</L>
          <NumberField label="px" value={common(props.map((p) => p.fontSize))} min={4} max={400} onChange={(v) => set({ fontSize: v }, 'fs')} />
        </div>
        <div className="field-col">
          <L k="fontWeight">Peso</L>
          <Select
            value={String(first.fontWeight)}
            onChange={(v) => set({ fontWeight: Number(v) })}
            options={[
              { value: '400', label: 'Regular' },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
            ]}
          />
        </div>
        <div className="field-col">
          <L k="lineHeight">Interlineado</L>
          <NumberField label="×" value={common(props.map((p) => p.lineHeight))} min={0.6} max={4} step={0.05} precision={2} onChange={(v) => set({ lineHeight: v }, 'lh')} />
        </div>
        <div className="field-col">
          <L k="textAlign">Alineación</L>
          <Segmented
            value={first.textAlign}
            onChange={(v) => set({ textAlign: v })}
            options={[
              { value: 'left', icon: 'text-left', title: 'Izquierda' },
              { value: 'center', icon: 'text-center', title: 'Centro' },
              { value: 'right', icon: 'text-right', title: 'Derecha' },
            ]}
          />
        </div>
      </div>
      <div className="field-col">
        <L k="color">Color del texto</L>
        <ColorField value={first.color} onChange={(v) => set({ color: v }, 'color')} />
      </div>
    </Section>
  )
}

function ImageSection({ value, set }: { value: ElementProps; set: SetFn }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Section title="Imagen" action={<L k={['src', 'fit']}> </L>}>
      <div className="btn-row">
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" size={13} /> {busy ? 'Cargando…' : 'Subir imagen'}
        </button>
        {value.src && (
          <button className="btn" onClick={() => set({ src: '' })}>
            Quitar
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            set({ src: await readImage(file) })
          } catch {
            toast('No se pudo leer la imagen. Prueba con un PNG o JPG.', 'error')
          } finally {
            setBusy(false)
          }
        }}
      />
      <TextField
        value={value.src.startsWith('data:') ? '' : value.src}
        placeholder={value.src.startsWith('data:') ? 'Imagen subida' : 'O pega la URL de una imagen'}
        onCommit={(v) => set({ src: v.trim() })}
      />
      <div className="row">
        <Label>Ajuste</Label>
        <Segmented
          value={value.fit}
          onChange={(v) => set({ fit: v })}
          options={[
            { value: 'cover', label: 'Rellenar' },
            { value: 'contain', label: 'Encajar' },
          ]}
        />
      </div>
    </Section>
  )
}

/** Lee una imagen y la reduce para no llenar el almacenamiento del navegador. */
function readImage(file: File, max = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(reader.result as string)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const png = file.type === 'image/png' || file.type === 'image/svg+xml'
        resolve(canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/* ---------- Prototipo de un elemento ---------- */

const ACTIONS: { value: InteractionAction | 'none'; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'navigate', label: 'Ir a pantalla' },
  { value: 'overlay', label: 'Abrir como modal' },
  { value: 'back', label: 'Volver atrás' },
  { value: 'close', label: 'Cerrar modal' },
  { value: 'url', label: 'Abrir enlace' },
]

const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'instant', label: 'Instantánea' },
  { value: 'dissolve', label: 'Fundido' },
  { value: 'slide-left', label: 'Deslizar a la izquierda' },
  { value: 'slide-right', label: 'Deslizar a la derecha' },
  { value: 'slide-up', label: 'Deslizar hacia arriba' },
]

function PrototypeSection({ project, screen, els, mode }: { project: Project; screen: Screen; els: DesignElement[]; mode: Mode }) {
  const ids = els.map((e) => e.id)
  const props = els.map((e) => resolveProps(e, mode.id))
  const interaction = common(props.map((p) => p.interaction))
  const mixed = interaction === null && props.some((p) => p.interaction)
  const overridden = project.modes.length > 1 && els.some((e) => isOverridden(e, mode.id, 'interaction'))
  const set = (patch: Partial<NonNullable<ElementProps['interaction']>> | null) =>
    updateElements(screen.id, ids, (p) => ({
      interaction: patch === null ? null : { action: 'navigate', target: null, transition: 'dissolve', url: '', ...p.interaction, ...patch },
    }))
  const action = interaction?.action ?? 'none'
  const needsTarget = action === 'navigate' || action === 'overlay'
  const otherModes = project.modes.filter((m) => m.id !== mode.id)
  const differs = otherModes.filter((m) => els.some((e) => JSON.stringify(resolveProps(e, m.id).interaction) !== JSON.stringify(resolveProps(e, mode.id).interaction)))

  return (
    <>
      <Section title="Al hacer clic">
        {mixed && <p className="muted small">Los elementos seleccionados tienen interacciones distintas.</p>}
        <div className="row">
          <Label overridden={overridden} mode={mode} onReset={() => resetOverrides(screen.id, ids, ['interaction'])}>
            Acción
          </Label>
          <Select
            value={action}
            onChange={(v) => (v === 'none' ? set(null) : set({ action: v as InteractionAction }))}
            options={ACTIONS}
          />
        </div>
        {needsTarget && (
          <div className="row">
            <Label>Destino</Label>
            <Select
              value={interaction?.target ?? ''}
              onChange={(v) => set({ target: v || null })}
              options={[
                { value: '', label: 'Elige una pantalla…' },
                ...project.screens
                  .filter((s) => s.id !== screen.id)
                  .map((s) => ({
                    value: s.id,
                    label: isScreenAvailable(s, mode.id) ? s.name : `${s.name} (no existe en ${mode.name})`,
                  })),
              ]}
            />
          </div>
        )}
        {(needsTarget || action === 'back') && (
          <div className="row">
            <Label>Transición</Label>
            <Select value={interaction?.transition ?? 'dissolve'} onChange={(v) => set({ transition: v })} options={TRANSITIONS} />
          </div>
        )}
        {action === 'url' && (
          <div className="field-col">
            <Label>Enlace</Label>
            <TextField value={interaction?.url ?? ''} placeholder="https://…" onCommit={(v) => set({ url: v.trim() })} />
          </div>
        )}
        {interaction && needsTarget && interaction.target && (
          <button className="link-btn" onClick={() => play(screen.id)}>
            Probar este flujo
          </button>
        )}
      </Section>
      {project.modes.length > 1 && (
        <Section title="Según el modo">
          {differs.length > 0 ? (
            <ul className="mode-diff">
              {project.modes.map((m) => {
                const it = resolveProps(els[0], m.id).interaction
                const target = it?.target ? findScreen(project, it.target)?.name : null
                const label = !it ? 'Sin acción' : ACTIONS.find((a) => a.value === it.action)?.label
                return (
                  <li key={m.id} style={{ '--mode': m.color } as CSSProperties} className={m.id === mode.id ? 'current' : ''}>
                    <span className="mode-dot" />
                    <span className="mode-diff-name">{m.name}</span>
                    <span className="mode-diff-val">
                      {label}
                      {target ? ` → ${target}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted small">Esta interacción es igual en todos los modos. Activa «Editando solo {mode.name}» para cambiarla únicamente aquí.</p>
          )}
        </Section>
      )}
      <Section title="Atajo">
        <p className="muted small">
          Arrastra el círculo azul que aparece a la derecha del elemento seleccionado hasta cualquier pantalla para crear el flujo.
        </p>
      </Section>
      {overridden && (
        <p className="muted small pad">
          {PROP_LABELS.interaction} propia de {mode.name}.
        </p>
      )}
    </>
  )
}
