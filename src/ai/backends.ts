import type Anthropic from '@anthropic-ai/sdk'
import { INSTRUCTIONS } from './prompt'
import { AI_TOOLS, type AiTool } from './tools'

/**
 * Dos formas de hablar con Claude:
 * - «claude»: dentro del artefacto publicado en claude.ai, con la cuenta de quien
 *   lo abre (capacidad `sample`). No necesita clave; la página no tiene red propia.
 * - «api»: en cualquier otro sitio, con una clave de la API de Anthropic que la
 *   persona pega en Ajustes y queda solo en su navegador.
 */
export type BackendId = 'claude' | 'api'

export interface RunHandlers {
  /** Texto de la respuesta completo hasta ahora. */
  onText(text: string): void
  /** Una línea de actividad («Editó 3 capas en Home»). */
  onActivity(line: string): void
  signal: AbortSignal
}

export class AiError extends Error {
  /** Lo ya escrito que puede quedarse en pantalla. */
  readonly partial: string
  /** Error que no se arregla reintentando (falta permiso, clave mala…). */
  readonly fatal: boolean
  constructor(message: string, partial = '', fatal = false) {
    super(message)
    this.partial = partial
    this.fatal = fatal
  }
}

export const API_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (el más capaz)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (más rápido)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (el más rápido y barato)' },
]

export const CLAUDE_TIERS = [
  { id: 'default', label: 'Normal' },
  { id: 'complex', label: 'Profundo (más lento)' },
  { id: 'quick', label: 'Rápido' },
] as const

export type ClaudeTier = (typeof CLAUDE_TIERS)[number]['id']

/* ---------- Claude en claude.ai (capacidad `sample` del artefacto) ---------- */

type SampleFn = (
  input: string | { role: 'user' | 'assistant'; content: string }[],
  options?: Record<string, unknown>,
) => Promise<{ text: string; truncated: boolean }>
type SampleNs = SampleFn & { limits(): Promise<{ tools?: { maxCount: number } }> }
type ClaudeRuntime = { use(name: 'sample'): Promise<SampleNs | null> }

let samplePromise: Promise<SampleNs | null> | null = null

/** La capacidad `sample` si esta página corre dentro de un artefacto de claude.ai. */
export function getSample(): Promise<SampleNs | null> {
  if (!samplePromise) {
    const rt = (window as unknown as { claude?: ClaudeRuntime }).claude
    samplePromise = rt?.use ? rt.use('sample').catch(() => null) : Promise.resolve(null)
  }
  return samplePromise
}

const SAMPLE_COPY: Record<string, string> = {
  not_granted: 'No diste permiso para usar Claude en esta página. Puedes activarlo desde los permisos del artefacto.',
  sampling_disabled: 'Claude no está disponible para tu cuenta u organización.',
  not_declared: 'Esta versión del artefacto no tiene acceso a Claude.',
  capability_disabled: 'Claude no está disponible en esta vista.',
  rate_limited: 'Llegaste al límite de uso por ahora. Prueba de nuevo en un rato.',
  session_expired: 'Tu sesión de Claude expiró: vuelve a iniciar sesión.',
  refused: 'Claude no puede ayudar con ese pedido. Prueba a pedirlo de otra forma.',
  empty_completion: 'Claude no respondió nada. Prueba a pedirlo de otra forma.',
  prompt_too_large: 'La conversación es demasiado larga. Empieza un chat nuevo.',
  tools_unavailable: 'Esta vista no permite que Claude edite el proyecto.',
}

export async function runWithClaude(
  turns: { role: 'user' | 'assistant'; content: string }[],
  tier: ClaudeTier,
  h: RunHandlers,
): Promise<string> {
  const sample = await getSample()
  if (!sample) throw new AiError('Claude no está disponible fuera de claude.ai. Usa tu API key en Ajustes.', '', true)
  const limits = await sample.limits().catch(() => null)
  const tools = limits?.tools
    ? AI_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input: Record<string, unknown>) => t.run(input, h.onActivity),
      }))
    : undefined
  let shown = ''
  try {
    const res = await sample([{ role: 'user', content: INSTRUCTIONS }, ...turns], {
      cache: false,
      modelTier: tier,
      signal: h.signal,
      tools,
      onText: ({ text }: { text: string }) => {
        shown = text
        h.onText(text)
      },
    })
    return res.truncated ? res.text + '\n\n_(Respuesta cortada por largo.)_' : res.text
  } catch (e) {
    const err = e as { code?: string; message?: string; text?: string }
    if (err.code === 'cancelled') throw new AiError('', err.text ?? shown)
    const fatal = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(err.code ?? '')
    const partial = err.code === 'refused' ? '' : (err.text ?? shown)
    throw new AiError(SAMPLE_COPY[err.code ?? ''] ?? 'Hubo un problema al hablar con Claude. Prueba de nuevo.', partial, fatal)
  }
}

/* ---------- API de Anthropic con la clave de la persona ---------- */

type BetaMessageParam = Anthropic.Beta.BetaMessageParam

/** Conversación completa con la API (incluye las llamadas a herramientas). Solo se añade al final. */
export interface ApiConversation {
  messages: BetaMessageParam[]
}

const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5'])

function apiTools(): Anthropic.Beta.BetaTool[] {
  return AI_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }))
}

function runTool(tool: AiTool | undefined, input: unknown, log: (l: string) => void): string {
  if (!tool) throw new Error('Herramienta desconocida.')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_JSON: la entrada debe ser un objeto.')
  return JSON.stringify(tool.run(input as Record<string, unknown>, log) ?? { ok: true })
}

export async function runWithApi(
  conv: ApiConversation,
  userContent: string,
  opts: { apiKey: string; model: string },
  h: RunHandlers,
): Promise<string> {
  let AnthropicSdk: typeof Anthropic
  try {
    AnthropicSdk = (await import('@anthropic-ai/sdk')).default
  } catch {
    throw new AiError('No se pudo cargar la conexión con la API. Dentro de claude.ai usa «Claude de claude.ai».', '', true)
  }
  // La clave es de la propia persona y vive solo en su navegador.
  const client = new AnthropicSdk({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true })
  conv.messages.push({ role: 'user', content: userContent })
  const tools = apiTools()
  let written = ''
  let jsonRetries = 0

  for (let round = 0; round < 25; round++) {
    const before = written
    const stream = client.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 64000,
        system: INSTRUCTIONS,
        tools,
        messages: conv.messages,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
        ...(SERVER_FALLBACK_MODELS.has(opts.model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal: h.signal },
    )
    stream.on('text', (delta) => {
      if (written === before && before) written += '\n\n'
      written += delta
      h.onText(written)
    })

    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (e) {
      if (h.signal.aborted) throw new AiError('', written)
      if (e instanceof AnthropicSdk.AuthenticationError) throw new AiError('La API key no es válida. Revísala en Ajustes.', written, true)
      if (e instanceof AnthropicSdk.PermissionDeniedError) throw new AiError('Esa API key no tiene permiso para este modelo.', written, true)
      if (e instanceof AnthropicSdk.RateLimitError) throw new AiError('Llegaste al límite de la API. Prueba de nuevo en un rato.', written)
      if (e instanceof AnthropicSdk.APIConnectionError)
        throw new AiError('No se pudo conectar con la API de Anthropic. Si estás en el artefacto de claude.ai, usa «Claude de claude.ai» en Ajustes.', written)
      if (e instanceof AnthropicSdk.APIError) throw new AiError(`Error de la API (${e.status ?? '?'}): ${e.message}`, written)
      // Entrada de herramienta que no se pudo leer: se repite el turno (unas pocas veces).
      if (jsonRetries++ < 2) {
        written = before
        continue
      }
      throw new AiError('Claude devolvió algo que no se pudo leer. Prueba de nuevo.', written)
    }

    if (message.stop_reason === 'refusal') {
      throw new AiError('Claude no puede ayudar con ese pedido. Prueba a pedirlo de otra forma.', '')
    }
    conv.messages.push({ role: 'assistant', content: message.content })
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (!uses.length) return written
    if (message.stop_reason === 'max_tokens') throw new AiError('La respuesta se cortó por largo. Pide algo más acotado.', written)

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
      try {
        return { type: 'tool_result', tool_use_id: u.id, content: runTool(AI_TOOLS.find((t) => t.name === u.name), u.input, h.onActivity) }
      } catch (err) {
        return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: (err as Error).message }
      }
    })
    conv.messages.push({ role: 'user', content: results })
  }
  return written
}
