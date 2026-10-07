import { Icon } from '../render/icons'
import { setTool, useStore, type Tool } from '../store/store'

const GROUPS: { tool: Tool; icon: string; label: string; key: string }[][] = [
  [
    { tool: 'move', icon: 'cursor', label: 'Mover', key: 'V' },
    { tool: 'hand', icon: 'hand', label: 'Mano', key: 'H' },
  ],
  [{ tool: 'screen', icon: 'frame', label: 'Pantalla', key: 'F' }],
  [
    { tool: 'rect', icon: 'square', label: 'Rectángulo', key: 'R' },
    { tool: 'ellipse', icon: 'circle', label: 'Elipse', key: 'O' },
    { tool: 'text', icon: 'type', label: 'Texto', key: 'T' },
  ],
  [
    { tool: 'button', icon: 'button-tool', label: 'Botón', key: 'B' },
    { tool: 'input', icon: 'input-tool', label: 'Campo', key: 'I' },
    { tool: 'image', icon: 'image-icon', label: 'Imagen', key: 'M' },
    { tool: 'icon', icon: 'star', label: 'Icono', key: 'K' },
  ],
]

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  return (
    <div className="toolbar" role="toolbar" aria-label="Herramientas">
      {GROUPS.map((group, i) => (
        <div className="tool-group" key={i}>
          {group.map((t) => (
            <button
              key={t.tool}
              className={`tool${tool === t.tool ? ' on' : ''}`}
              onClick={() => setTool(t.tool)}
              title={`${t.label} (${t.key})`}
              aria-pressed={tool === t.tool}
            >
              <Icon name={t.icon} size={18} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
