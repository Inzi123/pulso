import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Icon } from '../render/icons'

/* ---------- Campo numérico con arrastre en la etiqueta ---------- */

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (value: number, live: boolean) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  step?: number
  min?: number
  max?: number
  /** Decimales que se muestran. */
  precision?: number
  suffix?: string
  title?: string
}

export function NumberField({
  label,
  value,
  onChange,
  onScrubStart,
  onScrubEnd,
  step = 1,
  min = -Infinity,
  max = Infinity,
  precision = 0,
  suffix,
  title,
}: NumberFieldProps) {
  const format = (v: number | null) => formatNumber(v, precision)
  const [draft, setDraft] = useState(format(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(formatNumber(value, precision))
  }, [value, precision])

  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  const commit = () => {
    const parsed = evaluate(draft)
    if (parsed === null || value === null) {
      setDraft(format(value))
      return
    }
    const next = clamp(parsed)
    if (next !== value) onChange(next, false)
    setDraft(format(next))
  }

  const scrub = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (value === null) return
    e.preventDefault()
    const startX = e.clientX
    const start = value
    let started = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      if (!started && Math.abs(dx) < 2) return
      if (!started) {
        started = true
        onScrubStart?.()
      }
      const mult = ev.shiftKey ? 10 : 1
      onChange(clamp(round(start + Math.round(dx / 2) * step * mult, precision)), true)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (started) onScrubEnd?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <label className="num-field" title={title}>
      <span className="num-label" onPointerDown={scrub}>
        {label}
      </span>
      <input
        value={draft}
        placeholder={value === null ? 'Mixto' : undefined}
        inputMode="decimal"
        onFocus={(e) => {
          focused.current = true
          e.currentTarget.select()
        }}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(format(value))
            e.currentTarget.blur()
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const next = clamp(round(value + d, precision))
            onChange(next, false)
            setDraft(format(next))
          }
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </label>
  )
}

function formatNumber(v: number | null, precision: number) {
  return v === null ? '' : String(Number(v.toFixed(precision)))
}

function round(v: number, precision: number) {
  const f = 10 ** precision
  return Math.round(v * f) / f
}

/** Admite expresiones sencillas como «120+16» o «393/2». */
export function evaluate(text: string): number | null {
  const src = text.replace(/,/g, '.').replace(/\s+/g, '')
  if (!src) return null
  let i = 0
  const peek = () => src[i]
  const number = (): number => {
    if (peek() === '(') {
      i++
      const v = expr()
      if (peek() !== ')') throw new Error('paréntesis')
      i++
      return v
    }
    if (peek() === '-') {
      i++
      return -number()
    }
    const m = /^\d*\.?\d+/.exec(src.slice(i))
    if (!m) throw new Error('número')
    i += m[0].length
    return parseFloat(m[0])
  }
  const term = (): number => {
    let v = number()
    while (peek() === '*' || peek() === '/') {
      const op = src[i++]
      const r = number()
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const expr = (): number => {
    let v = term()
    while (peek() === '+' || peek() === '-') {
      const op = src[i++]
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  try {
    const v = expr()
    return i === src.length && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/* ---------- Color ---------- */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function toHex6(color: string): string {
  if (!HEX.test(color)) return '#000000'
  if (color.length === 4) return '#' + [...color.slice(1)].map((c) => c + c).join('')
  return color.slice(0, 7)
}

interface ColorFieldProps {
  value: string
  onChange: (value: string, live: boolean) => void
  onLiveStart?: () => void
  onLiveEnd?: () => void
  allowEmpty?: boolean
  placeholder?: string
}

export function ColorField({
  value,
  onChange,
  onLiveStart,
  onLiveEnd,
  allowEmpty,
  placeholder = 'Sin color',
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const live = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  const isSolid = HEX.test(value)
  const swatchStyle = value
    ? { background: value }
    : { background: 'repeating-conic-gradient(var(--checker) 0 25%, transparent 0 50%) 0 0 / 8px 8px' }

  const commit = () => {
    const v = draft.trim()
    if (v === value) return
    if (!v && allowEmpty) onChange('', false)
    else if (v && CSS.supports('background', v)) onChange(v, false)
    else setDraft(value)
  }

  return (
    <div className="color-field">
      <label className="swatch" style={swatchStyle} title="Elegir color">
        <input
          type="color"
          value={isSolid ? toHex6(value) : '#ffffff'}
          onInput={(e) => {
            if (!live.current) {
              live.current = true
              onLiveStart?.()
            }
            onChange((e.target as HTMLInputElement).value, true)
          }}
          onChange={() => undefined}
          onBlur={() => {
            if (live.current) {
              live.current = false
              onLiveEnd?.()
            }
          }}
        />
      </label>
      <input
        className="color-text"
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
      {allowEmpty && value && (
        <button className="icon-btn tiny" title="Quitar color" onClick={() => onChange('', false)}>
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  )
}

/* ---------- Texto que se confirma al salir ---------- */

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onCancel?: () => void
}

export function TextField({ value, onCommit, placeholder, className, autoFocus, onCancel }: TextFieldProps) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  return (
    <input
      className={className ?? 'text-input'}
      value={draft}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={(e) => {
        focused.current = true
        if (autoFocus) e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        if (draft !== value) onCommit(draft)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          onCancel?.()
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

/* ---------- Selector ---------- */

interface SelectProps<T extends string> {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
  className?: string
  title?: string
}

export function Select<T extends string>({ value, options, onChange, className, title }: SelectProps<T>) {
  return (
    <div className={`select ${className ?? ''}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} title={title}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={12} className="select-caret" />
    </div>
  )
}

/* ---------- Grupo segmentado ---------- */

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label?: string; icon?: string; title?: string }[]
  onChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${className ?? ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          title={o.title ?? o.label}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- Interruptor ---------- */

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  id: string
}) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  )
}

/* ---------- Menú desplegable ---------- */

export interface MenuItem {
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type MenuEntry = MenuItem | 'separator'

export function Menu({
  items,
  x,
  y,
  onClose,
}: {
  items: MenuEntry[]
  x: number
  y: number
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    })
  }, [x, y])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="menu-icon">{item.icon && <Icon name={item.icon} size={14} />}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

/* ---------- Diálogo ---------- */

export function Dialog({
  title,
  children,
  onClose,
  footer,
  wide,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl+'
