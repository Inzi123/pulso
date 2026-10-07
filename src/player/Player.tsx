import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { applyInteraction, currentScreenId, startNav, type PlayerNav } from '../model/flows'
import { isScreenAvailable } from '../model/modes'
import { findScreen } from '../model/project'
import type { DesignElement, ElementProps, Id, Project, Screen, Transition } from '../model/types'
import { ScreenContent } from '../render/ElementView'
import { Icon } from '../render/icons'
import { closePlayer, setPlayerMode, toast, useStore } from '../store/store'

interface Anim {
  prev: Id | null
  transition: Transition
  key: number
}

export function Player({ project }: { project: Project }) {
  const player = useStore((s) => s.player)!
  const modeId = player.modeId
  const mode = project.modes.find((m) => m.id === modeId)
  const [nav, setNav] = useState<PlayerNav>(() => startNav(player.screenId))
  const [anim, setAnim] = useState<Anim>({ prev: null, transition: 'instant', key: 0 })
  const [flash, setFlash] = useState(false)
  const [hotspots, setHotspots] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 800, h: 600 })
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const screenId = currentScreenId(nav)
  const screen = findScreen(project, screenId)
  const overlay = nav.overlay ? findScreen(project, nav.overlay) : undefined
  const available = !!screen && isScreenAvailable(screen, modeId)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!anim.prev) return
    const t = setTimeout(() => setAnim((a) => ({ ...a, prev: null })), 340)
    return () => clearTimeout(t)
  }, [anim])

  const go = useCallback(
    (next: PlayerNav, transition: Transition) => {
      const prevId = currentScreenId(nav)
      const changed = currentScreenId(next) !== prevId || next.stack.length !== nav.stack.length
      setAnim((a) => ({ prev: changed && transition !== 'instant' ? prevId : null, transition, key: a.key + 1 }))
      setNav(next)
    },
    [nav],
  )

  // Pantallas que avanzan solas (cargas, escaneos…).
  useEffect(() => {
    if (nav.overlay || !screen || !available) return
    const auto = screen.autoAdvance
    if (!auto?.target) return
    const t = setTimeout(() => {
      const next = applyInteraction(
        nav,
        { action: 'navigate', target: auto.target, transition: auto.transition, url: '' },
        project.screens,
        modeId,
      )
      if (next !== nav) go(next, auto.transition)
    }, Math.max(0, auto.delay))
    return () => clearTimeout(t)
  }, [nav, screen, available, project.screens, modeId, go])

  const restart = useCallback(() => {
    setAnim((a) => ({ prev: null, transition: 'instant', key: a.key + 1 }))
    setNav(startNav(player.screenId))
  }, [player.screenId])

  const back = useCallback(() => {
    if (nav.overlay) {
      setNav({ ...nav, overlay: null })
      return
    }
    if (nav.stack.length > 1) go({ stack: nav.stack.slice(0, -1), overlay: null }, 'slide-right')
  }, [nav, go])

  const activate = useCallback(
    (_el: DesignElement, p: ElementProps) => {
      const it = p.interaction
      if (!it) return
      if (it.action === 'url') {
        if (!it.url) return
        const win = window.open(it.url, '_blank', 'noopener')
        if (!win) toast(`Enlace: ${it.url}`)
        return
      }
      const next = applyInteraction(nav, it, project.screens, modeId)
      if (next === nav) {
        if ((it.action === 'navigate' || it.action === 'overlay') && it.target) {
          const target = findScreen(project, it.target)
          toast(target ? `«${target.name}» no existe en ${mode?.name ?? 'este modo'}` : 'La pantalla de destino ya no existe', 'error')
        } else if (it.action === 'navigate' || it.action === 'overlay') {
          toast('Esta interacción no tiene destino')
        }
        return
      }
      go(next, it.action === 'overlay' || it.action === 'close' ? 'instant' : it.transition)
    },
    [nav, project, modeId, mode, go],
  )

  /* Teclado */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (nav.overlay) setNav({ ...nav, overlay: null })
        else closePlayer()
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        back()
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
        restart()
      } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        const m = project.modes[Number(e.code.slice(5)) - 1]
        if (m) setPlayerMode(m.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, back, restart, project.modes])

  const onMissClick = () => {
    clearTimeout(flashTimer.current)
    setFlash(true)
    flashTimer.current = setTimeout(() => setFlash(false), 650)
  }

  const frame = !project.frame || project.frame === 'auto' ? (project.kind === 'app' ? 'phone' : 'browser') : project.frame
  const isApp = frame === 'phone'
  const isWeb = frame === 'browser'
  const base = screen ?? project.screens[0]
  const vw = base?.width ?? 393
  const vh = Math.min(base?.height ?? 852, project.viewportHeight || base?.height || 852)
  const bezel = isApp ? 12 : 0
  const chrome = isWeb ? 40 : 0
  const frameW = vw + bezel * 2
  const frameH = vh + bezel * 2 + chrome
  const scale = Math.min(1, (stage.w - 32) / frameW, (stage.h - 32) / frameH)
  const prevScreen = anim.prev ? findScreen(project, anim.prev) : undefined

  const renderLayer = (s: Screen, cls: string, key: string) => (
    <div key={key} className={`pl-layer ${cls}`}>
      <div className="pl-scroll" onClick={onMissClick}>
        <div className="pl-screen" style={{ width: s.width, height: s.height, background: s.fill || '#fff' }}>
          <ScreenContent screen={s} modeId={modeId} context="player" onActivate={activate} filter={(p) => !p.fixed} />
        </div>
      </div>
      <div className="pl-fixed" style={{ width: s.width }}>
        <ScreenContent screen={s} modeId={modeId} context="player" onActivate={activate} filter={(p) => p.fixed} />
      </div>
    </div>
  )

  const slug = (screen?.name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return (
    <div className="player" role="dialog" aria-label="Prototipo">
      <header className="player-bar">
        <button className="btn ghost-dark" onClick={closePlayer} title="Volver al editor (Esc)">
          <Icon name="arrow-left" size={14} />
          <span className="hide-sm">Editor</span>
        </button>
        <div className="player-title">
          <span className="player-screen">{screen?.name ?? '—'}</span>
          <span className="player-step">
            Paso {nav.stack.length}
            {overlay ? ` · modal «${overlay.name}»` : ''}
          </span>
        </div>
        <div className="player-modes" role="radiogroup" aria-label="Modo del prototipo">
          {project.modes.length > 1 &&
            project.modes.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={m.id === modeId}
                className={m.id === modeId ? 'on' : ''}
                style={{ '--mode': m.color } as CSSProperties}
                onClick={() => setPlayerMode(m.id)}
              >
                <span className="mode-dot" />
                {m.name}
              </button>
            ))}
        </div>
        <div className="player-actions">
          <button className="icon-btn dark" onClick={back} disabled={nav.stack.length <= 1 && !nav.overlay} title="Atrás (←)">
            <Icon name="chevron-left" size={16} />
          </button>
          <button className="icon-btn dark" onClick={restart} title="Reiniciar (R)">
            <Icon name="restart" size={15} />
          </button>
          <button
            className={`icon-btn dark${hotspots ? ' on' : ''}`}
            onClick={() => setHotspots((v) => !v)}
            title="Mostrar zonas clicables"
          >
            <Icon name="zap" size={15} />
          </button>
        </div>
      </header>

      <div className="player-stage" ref={stageRef}>
        <div
          className={`device device-${frame}`}
          style={{ width: frameW, height: frameH, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {isWeb && (
            <div className="browser-bar">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span className="url">
                {project.name.toLowerCase().split(/[\s·]+/)[0]}.app/{slug}
              </span>
            </div>
          )}
          <div
            className={`pl-viewport${flash || hotspots ? ' show-hotspots' : ''}`}
            style={{ width: vw, height: vh, borderRadius: isApp ? 42 : frame === 'none' ? 14 : 0 }}
          >
            {screen && available ? (
              <>
                {prevScreen && renderLayer(prevScreen, `leave leave-${anim.transition}`, `prev-${anim.key}`)}
                {renderLayer(screen, anim.prev ? `enter enter-${anim.transition}` : '', `cur-${screen.id}-${nav.stack.length}`)}
              </>
            ) : (
              <div className="pl-missing">
                <Icon name="eye-off" size={28} />
                <p>
                  «{screen?.name ?? 'Pantalla'}» no existe en <b>{mode?.name}</b>.
                </p>
                <div className="btn-row">
                  {nav.stack.length > 1 && (
                    <button className="btn" onClick={back}>
                      Volver
                    </button>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => {
                      const start =
                        [project.startScreenId, ...project.screens.map((s) => s.id)]
                          .map((id) => (id ? findScreen(project, id) : undefined))
                          .find((s) => s && isScreenAvailable(s, modeId))
                      if (start) {
                        setAnim((a) => ({ prev: null, transition: 'instant', key: a.key + 1 }))
                        setNav(startNav(start.id))
                      }
                    }}
                  >
                    Ir al inicio
                  </button>
                </div>
              </div>
            )}
            {overlay && isScreenAvailable(overlay, modeId) && (
              <div className="pl-overlay-backdrop" onClick={() => setNav({ ...nav, overlay: null })}>
                <div
                  className="pl-overlay"
                  style={{
                    width: overlay.width,
                    height: overlay.height,
                    background: overlay.fill || '#fff',
                    transform: `scale(${Math.min(1, (vw - 24) / overlay.width, (vh - 24) / overlay.height)})`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onMissClick()
                  }}
                >
                  <ScreenContent screen={overlay} modeId={modeId} context="player" onActivate={activate} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="player-hint">
        Haz clic en los elementos para navegar · Clic en una zona vacía muestra las zonas clicables · Esc para salir
      </footer>
    </div>
  )
}

