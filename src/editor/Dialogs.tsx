import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { describeOverrides, isScreenAvailable, screenChangesInMode } from '../model/modes'
import { findScreen } from '../model/project'
import type { Project } from '../model/types'
import { ScreenThumb } from '../render/ElementView'
import { Icon } from '../render/icons'
import { Dialog, MOD } from '../ui/controls'
import { play, setMode, setState, useStore } from '../store/store'

/* ---------- Comparar una pantalla en todos los modos ---------- */

export function CompareDialog({ project }: { project: Project }) {
  const screenId = useStore((s) => s.compareScreenId)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 500 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [screenId])
  const screen = screenId ? findScreen(project, screenId) : undefined
  if (!screen) return null
  const close = () => setState({ compareScreenId: null })
  const n = project.modes.length
  const colW = Math.max(160, Math.min(420, (box.w - (n - 1) * 20) / n))
  const thumbH = Math.max(200, Math.min(box.h - 120, 720))

  return (
    <Dialog title={`Comparar modos · ${screen.name}`} onClose={close} wide>
      <div className="compare" ref={ref}>
        {project.modes.map((m) => {
          const available = isScreenAvailable(screen, m.id)
          const changes = screenChangesInMode(screen, m.id)
          const details = screen.elements
            .filter((e) => e.overrides[m.id])
            .slice(0, 4)
            .map((e) => `${e.name}: ${describeOverrides(e, m.id).join(', ').toLowerCase()}`)
          return (
            <div key={m.id} className="compare-col" style={{ width: colW, '--mode': m.color } as CSSProperties}>
              <header className="compare-head">
                <span className="mode-dot" />
                <b>{m.name}</b>
                <span className="muted small">
                  {available ? (changes ? `${changes} ${changes === 1 ? 'cambio' : 'cambios'}` : 'Sin cambios') : 'No existe'}
                </span>
              </header>
              <div className={`compare-thumb${available ? '' : ' off'}`}>
                <ScreenThumb screen={screen} modeId={m.id} width={colW - 28} height={thumbH} />
                {!available && <span className="compare-off">No existe en {m.name}</span>}
              </div>
              {details.length > 0 && (
                <ul className="compare-details">
                  {details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <div className="btn-row">
                <button
                  className="btn"
                  onClick={() => {
                    setMode(m.id)
                    close()
                  }}
                >
                  Editar en {m.name}
                </button>
                {available && (
                  <button
                    className="btn primary"
                    onClick={() => {
                      setMode(m.id)
                      close()
                      play(screen.id)
                    }}
                  >
                    <Icon name="play" size={12} strokeWidth={2.2} /> Probar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}

/* ---------- Atajos ---------- */

const SHORTCUTS: [string, string][] = [
  ['V', 'Mover / seleccionar'],
  ['H o Espacio', 'Desplazar el lienzo'],
  ['F', 'Nueva pantalla (clic o arrastrar)'],
  ['R · O · T', 'Rectángulo · Elipse · Texto'],
  ['B · I · M · K', 'Botón · Campo · Imagen · Icono'],
  [`${MOD}↵ o P`, 'Probar el prototipo'],
  ['Alt+1…9', 'Cambiar de modo'],
  ['E', 'Editar solo el modo activo / todos'],
  ['C', 'Comparar modos de la pantalla'],
  ['L', 'Mostrar u ocultar flujos'],
  [`${MOD}Z · ${MOD}⇧Z`, 'Deshacer · Rehacer'],
  [`${MOD}C · ${MOD}V · ${MOD}D`, 'Copiar · Pegar · Duplicar'],
  ['Alt + arrastrar', 'Duplicar mientras mueves'],
  ['⇧ + arrastrar', 'Bloquear eje / mantener proporción'],
  [`${MOD} + arrastrar`, 'Seleccionar por área dentro de una pantalla'],
  ['Flechas', 'Mover 1 px (⇧ 10 px)'],
  ['[ · ]', 'Enviar al fondo · Traer al frente'],
  ['Intro · Doble clic', 'Editar texto'],
  ['⇧1 · ⇧2 · ⇧0', 'Ver todo · Ir a selección · 100 %'],
  [`${MOD} + rueda / pellizco`, 'Zoom'],
]

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen)
  if (!open) return null
  return (
    <Dialog title="Atajos de teclado" onClose={() => setState({ helpOpen: false })}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

/* ---------- Avisos ---------- */

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
