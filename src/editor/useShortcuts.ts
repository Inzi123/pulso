import { useEffect } from 'react'
import {
  NO_SELECTION,
  copySelection,
  currentProject,
  deleteSelection,
  duplicateSelection,
  getState,
  nudgeSelection,
  paste,
  play,
  redo,
  reorderSelection,
  select,
  setMode,
  setScope,
  setState,
  setTool,
  undo,
  zoomBy,
  zoomTo,
  zoomToFit,
  zoomToSelection,
  type Tool,
} from '../store/store'
import { isEditable } from './Canvas'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'move',
  h: 'hand',
  f: 'screen',
  a: 'screen',
  r: 'rect',
  o: 'ellipse',
  t: 'text',
  b: 'button',
  i: 'input',
  m: 'image',
  k: 'icon',
}

/** Atajos de teclado del editor. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = getState()
      if (state.player || isEditable(e.target)) return
      if (document.querySelector('.dialog-backdrop')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod) {
        switch (key) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) redo()
            else undo()
            return
          case 'y':
            e.preventDefault()
            redo()
            return
          case 'c':
            if (window.getSelection()?.toString()) return
            e.preventDefault()
            copySelection()
            return
          case 'x':
            e.preventDefault()
            copySelection()
            deleteSelection()
            return
          case 'v':
            e.preventDefault()
            paste()
            return
          case 'd':
            e.preventDefault()
            duplicateSelection()
            return
          case 'a': {
            e.preventDefault()
            const p = currentProject()
            const sel = state.selection
            if (!p) return
            if (sel.kind === 'elements') {
              const s = p.screens.find((x) => x.id === sel.screenId)
              if (s) select({ kind: 'elements', screenId: s.id, ids: s.elements.map((x) => x.id) })
            } else {
              select({ kind: 'screens', ids: p.screens.map((x) => x.id) })
            }
            return
          }
          case 'enter':
            e.preventDefault()
            play()
            return
          case '=':
          case '+':
            e.preventDefault()
            zoomBy(1.25)
            return
          case '-':
            e.preventDefault()
            zoomBy(0.8)
            return
          case '0':
            e.preventDefault()
            zoomTo(1)
            return
        }
        return
      }

      if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        const p = currentProject()
        const m = p?.modes[Number(e.code.slice(5)) - 1]
        if (m) {
          e.preventDefault()
          setMode(m.id)
        }
        return
      }

      if (e.shiftKey) {
        if (e.code === 'Digit1') {
          e.preventDefault()
          zoomToFit()
          return
        }
        if (e.code === 'Digit2') {
          e.preventDefault()
          zoomToSelection()
          return
        }
        if (e.code === 'Digit0') {
          e.preventDefault()
          zoomTo(1)
          return
        }
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          deleteSelection()
          return
        case 'Escape': {
          const sel = state.selection
          if (state.tool !== 'move') setTool('move')
          else if (sel.kind === 'elements') select({ kind: 'screens', ids: [sel.screenId] })
          else select(NO_SELECTION)
          return
        }
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (state.selection.kind === 'none') return
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          nudgeSelection(dx, dy)
          return
        }
        case ']':
          reorderSelection(e.altKey ? 'forward' : 'front')
          return
        case '[':
          reorderSelection(e.altKey ? 'backward' : 'back')
          return
        case 'Enter': {
          const sel = state.selection
          const p = currentProject()
          if (sel.kind === 'screens' && sel.ids.length === 1 && p) {
            const s = p.screens.find((x) => x.id === sel.ids[0])
            if (s && s.elements.length) select({ kind: 'elements', screenId: s.id, ids: [s.elements[s.elements.length - 1].id] })
          } else if (sel.kind === 'elements' && sel.ids.length === 1 && p) {
            const s = p.screens.find((x) => x.id === sel.screenId)
            const el = s?.elements.find((x) => x.id === sel.ids[0])
            if (el && (el.type === 'text' || el.type === 'button' || el.type === 'input')) {
              e.preventDefault()
              setState({ editingTextId: el.id })
            }
          }
          return
        }
        case '?':
          setState({ helpOpen: true })
          return
      }

      if (e.altKey || e.shiftKey) return
      if (key === 'p') {
        play()
        return
      }
      if (key === 'l') {
        setState({ showFlows: !state.showFlows })
        return
      }
      if (key === 'e') {
        const p = currentProject()
        if (p && p.modes.length > 1) setScope(state.scope === 'mode' ? 'all' : 'mode')
        return
      }
      if (key === 'c' && state.selection.kind === 'screens' && state.selection.ids.length === 1) {
        setState({ compareScreenId: state.selection.ids[0] })
        return
      }
      const tool = TOOL_KEYS[key]
      if (tool) setTool(tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

