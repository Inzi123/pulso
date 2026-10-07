import { useEffect } from 'react'
import { Player } from '../player/Player'
import { togglePanel, useStore } from '../store/store'
import { Canvas } from './Canvas'
import { CompareDialog, HelpDialog } from './Dialogs'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { Toolbar } from './Toolbar'
import { TopBar } from './TopBar'
import { useShortcuts } from './useShortcuts'

export function Editor() {
  const project = useStore((s) => (s.openId ? s.projects[s.openId] : null))
  const panels = useStore((s) => s.panels)
  const player = useStore((s) => s.player)
  useShortcuts()

  useEffect(() => {
    if (window.innerWidth < 900) {
      togglePanel('left', false)
      togglePanel('right', false)
    } else {
      togglePanel('left', true)
      togglePanel('right', true)
    }
  }, [])

  if (!project) return null
  return (
    <div className="editor">
      <TopBar project={project} />
      <div className={`editor-main${panels.left ? ' has-left' : ''}${panels.right ? ' has-right' : ''}`}>
        {panels.left && <LayersPanel project={project} />}
        <div className="canvas-wrap">
          <Canvas />
          <Toolbar />
        </div>
        {panels.right && <Inspector project={project} />}
      </div>
      {player && <Player project={project} />}
      <CompareDialog project={project} />
      <HelpDialog />
    </div>
  )
}
