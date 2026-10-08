import { memo, type CSSProperties, type ReactNode } from 'react'
import { resolveProps } from '../model/modes'
import type { DesignElement, ElementProps, Id, Screen } from '../model/types'
import { Icon } from './icons'

const SHADOWS: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.06)',
  md: '0 6px 16px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)',
  lg: '0 18px 40px rgba(16,24,40,.18), 0 4px 10px rgba(16,24,40,.08)',
}

export function fontStack(family: string): string {
  if (family === 'system-ui') return 'system-ui, -apple-system, "Segoe UI", sans-serif'
  const generic = family === 'Fraunces' ? 'Georgia, serif' : family === 'Geist Mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'
  return `"${family}", ${generic}`
}

export function elementStyle(type: DesignElement['type'], p: ElementProps): CSSProperties {
  const style: CSSProperties = {
    position: 'absolute',
    left: p.x,
    top: p.y,
    width: p.width,
    height: p.height,
    opacity: p.opacity,
    background: p.fill || 'transparent',
    borderRadius: type === 'ellipse' ? '50%' : p.radius,
    border: p.stroke && p.strokeWidth > 0 ? `${p.strokeWidth}px solid ${p.stroke}` : undefined,
    boxShadow: SHADOWS[p.shadow] ?? p.shadow,
    backdropFilter: p.blur ? `blur(${p.blur}px)` : undefined,
    WebkitBackdropFilter: p.blur ? `blur(${p.blur}px)` : undefined,
    mask: p.mask || undefined,
    WebkitMask: p.mask || undefined,
    filter: p.filter || undefined,
    mixBlendMode: p.blend || undefined,
    letterSpacing: p.letterSpacing ? `${p.letterSpacing}px` : undefined,
    fontStyle: p.italic ? 'italic' : undefined,
    boxSizing: 'border-box',
    color: p.color,
    fontFamily: fontStack(p.fontFamily),
    fontSize: p.fontSize,
    fontWeight: p.fontWeight,
    lineHeight: p.lineHeight,
    textAlign: p.textAlign,
  }
  if (type === 'button' || type === 'input' || type === 'icon') {
    style.display = 'flex'
    style.alignItems = 'center'
    style.justifyContent =
      type === 'icon' || p.textAlign === 'center'
        ? 'center'
        : p.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start'
  }
  if (type === 'button') style.padding = '0 12px'
  if (type === 'input') style.padding = '0 14px'
  if (type === 'image') style.overflow = 'hidden'
  return style
}

export type RenderContext = 'canvas' | 'player' | 'static'

interface ElementViewProps {
  el: DesignElement
  props: ElementProps
  context: RenderContext
  /** Elemento editándose como texto en el canvas. */
  editing?: boolean
  onActivate?: (el: DesignElement, props: ElementProps) => void
  children?: ReactNode
}

function textContent(type: DesignElement['type'], p: ElementProps, context: RenderContext): ReactNode {
  if (type === 'input' && context === 'player') {
    return (
      <input
        className="proto-input"
        placeholder={p.text}
        style={{ color: p.color, font: 'inherit' }}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }
  if (type === 'button') return <span className="el-content el-content-button">{p.text}</span>
  if (type === 'input')
    return <span className="el-content el-content-input">{p.text}</span>
  return <span className="el-content">{p.text}</span>
}

export const ElementView = memo(function ElementView({
  el,
  props: p,
  context,
  editing,
  onActivate,
}: ElementViewProps) {
  const style = elementStyle(el.type, p)
  const interactive = context === 'player' && !!p.interaction
  if (interactive) style.cursor = 'pointer'

  let content: ReactNode = null
  switch (el.type) {
    case 'text':
    case 'button':
    case 'input':
      content = editing ? null : textContent(el.type, p, context)
      break
    case 'image':
      content = p.src ? (
        <img
          src={p.src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: p.fit, display: 'block' }}
        />
      ) : (
        <div className="img-placeholder">
          <Icon name="image-icon" size={Math.max(16, Math.min(48, Math.min(p.width, p.height) / 3))} strokeWidth={1.5} />
        </div>
      )
      break
    case 'icon':
      content = <Icon name={p.icon} size="100%" strokeWidth={2} />
      break
  }

  return (
    <div
      className={`el el-${el.type}${interactive ? ' el-hotspot' : ''}${p.nowrap ? ' el-nowrap' : ''}`}
      data-el={context === 'canvas' ? el.id : undefined}
      style={style}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation()
              onActivate?.(el, p)
            }
          : undefined
      }
    >
      {content}
    </div>
  )
})

interface ScreenContentProps {
  screen: Screen
  modeId: Id
  context: RenderContext
  editingId?: Id | null
  onActivate?: (el: DesignElement, props: ElementProps) => void
  /** Solo pinta los elementos que cumplen el filtro (p. ej. fijos / no fijos). */
  filter?: (p: ElementProps) => boolean
}

/** Pinta los elementos visibles de una pantalla en un modo. */
export function ScreenContent({
  screen,
  modeId,
  context,
  editingId,
  onActivate,
  filter,
}: ScreenContentProps) {
  return (
    <>
      {screen.elements.map((el) => {
        const p = resolveProps(el, modeId)
        if (p.hidden) return null
        if (filter && !filter(p)) return null
        return (
          <ElementView
            key={el.id}
            el={el}
            props={p}
            context={context}
            editing={editingId === el.id}
            onActivate={onActivate}
          />
        )
      })}
    </>
  )
}

/** Miniatura estática de una pantalla, escalada para caber en una caja. */
export function ScreenThumb({
  screen,
  modeId,
  width,
  height,
}: {
  screen: Screen
  modeId: Id
  width: number
  height: number
}) {
  const scale = Math.min(width / screen.width, height / screen.height)
  return (
    <div
      className="screen-thumb"
      style={{ width: screen.width * scale, height: screen.height * scale }}
    >
      <div
        style={{
          width: screen.width,
          height: screen.height,
          background: screen.fill,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <ScreenContent screen={screen} modeId={modeId} context="static" />
      </div>
    </div>
  )
}
