import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { Id } from '../model/types'
import { Icon } from '../render/icons'
import { setState as setAppState } from '../store/store'
import { Select } from '../ui/controls'
import {
  AiError,
  API_MODELS,
  CLAUDE_TIERS,
  getSample,
  runWithApi,
  runWithClaude,
  type ApiConversation,
  type BackendId,
  type ClaudeTier,
} from './backends'
import { Markdown } from './markdown'
import { contextNote } from './tools'

/* ---------- Ajustes (solo en este navegador) ---------- */

interface AiSettings {
  engine: BackendId | null
  apiKey: string
  model: string
  tier: ClaudeTier
}

const SETTINGS_KEY = 'hilo:ai'
const DEFAULT_SETTINGS: AiSettings = { engine: null, apiKey: '', model: API_MODELS[0].id, tier: 'default' }

function loadSettings(): AiSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: AiSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* sin almacenamiento: los ajustes duran lo que la pestaña */
  }
}

/* ---------- Conversaciones (una por proyecto, mientras dure la pestaña) ---------- */

interface ChatItem {
  id: number
  role: 'user' | 'assistant'
  /** Lo que se ve. */
  text: string
  /** Lo que se le mandó a Claude (el mensaje con el contexto delante). */
  sent?: string
  activity: string[]
  error?: string
  pending?: boolean
}

interface Chat {
  items: ChatItem[]
  api: ApiConversation
}

const useChats = create<{ chats: Record<Id, Chat> }>(() => ({ chats: {} }))
const emptyChat = (): Chat => ({ items: [], api: { messages: [] } })
let seq = 0

function patchItem(projectId: Id, id: number, patch: Partial<ChatItem> | ((it: ChatItem) => Partial<ChatItem>)) {
  useChats.setState((s) => {
    const chat = s.chats[projectId]
    if (!chat) return s
    return {
      chats: {
        ...s.chats,
        [projectId]: {
          ...chat,
          items: chat.items.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)),
        },
      },
    }
  })
}

const SUGGESTIONS = [
  '¿Qué flujos tiene este proyecto y dónde quedan cortados?',
  'Resume en qué cambia cada modo',
  'Revisa la pantalla seleccionada y sugiere mejoras',
  'Crea una pantalla de inicio de sesión con el mismo estilo',
]

/* ---------- Panel ---------- */

export function AiPanel({ projectId }: { projectId: Id }) {
  const chat = useChats((s) => s.chats[projectId]) ?? emptyChat()
  const [settings, setSettings] = useState<AiSettings>(loadSettings)
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    void getSample().then((s) => alive && setClaudeAvailable(!!s))
    return () => {
      alive = false
    }
  }, [])

  // Motor efectivo: el elegido, o Claude de claude.ai si está, o la API si hay clave.
  const engine: BackendId | null =
    settings.engine === 'claude' && claudeAvailable
      ? 'claude'
      : settings.engine === 'api' && settings.apiKey
        ? 'api'
        : claudeAvailable
          ? 'claude'
          : settings.apiKey
            ? 'api'
            : null
  const needsSetup = claudeAvailable !== null && engine === null

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [chat.items])

  useEffect(() => () => abortRef.current?.abort(), [])

  const update = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || running || !engine) return
    setDraft('')
    const sent = `[Contexto del editor] ${contextNote()}\n\n${text}`
    const userItem: ChatItem = { id: ++seq, role: 'user', text, sent, activity: [] }
    const botItem: ChatItem = { id: ++seq, role: 'assistant', text: '', activity: [], pending: true }
    const current = useChats.getState().chats[projectId] ?? emptyChat()
    const history = current.items
    useChats.setState((s) => ({ chats: { ...s.chats, [projectId]: { ...current, items: [...history, userItem, botItem] } } }))

    const ctl = new AbortController()
    abortRef.current = ctl
    setRunning(true)
    const handlers = {
      signal: ctl.signal,
      onText: (t: string) => patchItem(projectId, botItem.id, { text: t }),
      onActivity: (line: string) => patchItem(projectId, botItem.id, (it) => ({ activity: [...it.activity, line] })),
    }
    try {
      let final: string
      if (engine === 'claude') {
        // Claude no recuerda nada entre llamadas: se le manda la conversación como texto.
        const turns = history
          .filter((it) => !it.pending && (it.role === 'user' || it.text.trim()))
          .map((it) => ({ role: it.role, content: it.role === 'user' ? (it.sent ?? it.text) : it.text }))
        final = await runWithClaude([...turns, { role: 'user', content: sent }], settings.tier, handlers)
      } else {
        final = await runWithApi(current.api, sent, { apiKey: settings.apiKey, model: settings.model }, handlers)
      }
      patchItem(projectId, botItem.id, (it) => ({ text: final || (it.activity.length ? '' : 'Listo.'), pending: false }))
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Hubo un problema inesperado. Prueba de nuevo.')
      patchItem(projectId, botItem.id, {
        text: err.partial,
        error: ctl.signal.aborted ? 'Detenido.' : err.message,
        pending: false,
      })
      if (err.fatal && engine === 'api') setShowSettings(true)
    } finally {
      setRunning(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  const newChat = () => {
    abortRef.current?.abort()
    useChats.setState((s) => ({ chats: { ...s.chats, [projectId]: emptyChat() } }))
  }

  return (
    <aside className="ai-panel" aria-label="Asistente">
      <header className="ai-head">
        <span className="ai-title">
          <Icon name="sparkles" size={15} />
          Asistente
        </span>
        <span className="ai-engine">
          {engine === 'claude' ? 'Claude · tu cuenta de claude.ai' : engine === 'api' ? API_MODELS.find((m) => m.id === settings.model)?.label.split(' (')[0] : ''}
        </span>
        <button className="icon-btn" onClick={newChat} title="Chat nuevo" disabled={!chat.items.length}>
          <Icon name="edit" size={15} />
        </button>
        <button className={`icon-btn${showSettings ? ' on' : ''}`} onClick={() => setShowSettings((v) => !v)} title="Ajustes del asistente">
          <Icon name="settings" size={15} />
        </button>
        <button className="icon-btn" onClick={() => setAppState({ aiOpen: false })} title="Cerrar">
          <Icon name="x" size={15} />
        </button>
      </header>

      {(showSettings || needsSetup) && (
        <section className="ai-settings">
          {claudeAvailable && (
            <div className="ai-engines" role="radiogroup" aria-label="Con qué se conecta">
              <button role="radio" aria-checked={engine === 'claude'} className={engine === 'claude' ? 'on' : ''} onClick={() => update({ engine: 'claude' })}>
                <b>Claude de claude.ai</b>
                <span>Con tu cuenta, sin API key.</span>
              </button>
              <button role="radio" aria-checked={engine === 'api'} className={engine === 'api' ? 'on' : ''} onClick={() => update({ engine: 'api' })}>
                <b>Mi API key</b>
                <span>Fuera de claude.ai, en tu propia app.</span>
              </button>
            </div>
          )}
          {claudeAvailable === false && needsSetup && (
            <p className="muted small">
              Para usar el asistente, pega una API key de Anthropic. Se guarda solo en este navegador y las
              llamadas van directo de tu navegador a Anthropic.
            </p>
          )}
          {(engine === 'api' || settings.engine === 'api' || claudeAvailable === false) && (
            <>
              <label className="ai-field">
                <span>API key de Anthropic</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  value={settings.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value.trim(), engine: 'api' })}
                />
              </label>
              <label className="ai-field">
                <span>Modelo</span>
                <Select value={settings.model} onChange={(v) => update({ model: v })} options={API_MODELS.map((m) => ({ value: m.id, label: m.label }))} />
              </label>
              {claudeAvailable && (
                <p className="muted small">
                  Dentro de claude.ai la página no puede conectarse a internet: la API key sirve cuando abres Hilo fuera
                  de claude.ai.
                </p>
              )}
            </>
          )}
          {engine === 'claude' && (
            <label className="ai-field">
              <span>Respuestas</span>
              <Select value={settings.tier} onChange={(v) => update({ tier: v })} options={CLAUDE_TIERS.map((t) => ({ value: t.id, label: t.label }))} />
            </label>
          )}
        </section>
      )}

      <div className="ai-list" ref={listRef}>
        {!chat.items.length && !needsSetup && (
          <div className="ai-empty">
            <p>
              Pregunta por el proyecto o pide cambios: textos, colores, pantallas nuevas, flujos o diferencias entre
              modos. Todo lo que haga se deshace con Ctrl+Z.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ai-chip" onClick={() => void send(s)} disabled={!engine}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.items.map((it) =>
          it.role === 'user' ? (
            <div key={it.id} className="ai-msg ai-user">
              {it.text}
            </div>
          ) : (
            <div key={it.id} className="ai-msg ai-bot">
              {it.activity.length > 0 && (
                <ul className="ai-activity">
                  {it.activity.map((a, i) => (
                    <li key={i}>
                      <Icon name="check" size={12} strokeWidth={2.4} />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              {it.text && <Markdown text={it.text} />}
              {it.pending && !it.text && <span className="ai-thinking">Pensando…</span>}
              {it.error && <p className="ai-error">{it.error}</p>}
            </div>
          ),
        )}
      </div>

      <form
        className="ai-compose"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          disabled={!engine}
          placeholder={engine ? 'Escribe un mensaje…' : 'Configura el asistente arriba'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        {running ? (
          <button type="button" className="ai-send stop" onClick={() => abortRef.current?.abort()} title="Detener">
            <span className="stop-square" />
          </button>
        ) : (
          <button type="submit" className="ai-send" disabled={!draft.trim() || !engine} title="Enviar (Intro)">
            <Icon name="arrow-right" size={16} strokeWidth={2.2} />
          </button>
        )}
      </form>
    </aside>
  )
}
