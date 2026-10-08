import type { Project } from '../model/types'

/** Familias que ya carga index.html. */
const BUILTIN = new Set([
  'Geist',
  'Geist Mono',
  'DM Sans',
  'Fraunces',
  'Nunito',
  'Space Grotesk',
  'Plus Jakarta Sans',
  'system-ui',
])
const requested = new Set<string>()

function addLink(href: string, onError?: () => void) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  if (onError) link.onerror = onError
  document.head.appendChild(link)
}

/** Carga desde Google Fonts las familias que use un proyecto y aún no estén. */
export function ensureFonts(families: Iterable<string>) {
  for (const f of families) {
    if (!f || BUILTIN.has(f) || requested.has(f) || !/^[\w .-]+$/.test(f)) continue
    requested.add(f)
    const name = encodeURIComponent(f).replace(/%20/g, '+')
    // Con varios pesos; si la familia no los tiene todos, la petición falla y se pide la básica.
    addLink(`https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap`, () =>
      addLink(`https://fonts.googleapis.com/css2?family=${name}&display=swap`),
    )
  }
}

export function projectFonts(project: Project): Set<string> {
  const out = new Set<string>()
  for (const s of project.screens) {
    for (const el of s.elements) {
      out.add(el.props.fontFamily)
      for (const ov of Object.values(el.overrides)) if (ov.fontFamily) out.add(ov.fontFamily)
    }
  }
  return out
}
