import { describe, expect, it } from 'vitest'
import { createElement, createProject, createScreen } from './defaults'
import { applyInteraction, computeFlows, startNav } from './flows'
import { resizeRect, snapRect } from './geometry'
import { copyModeOverrides, removeModeFromProject, resolveProps, setVisibleInMode, writeProps } from './modes'
import { cloneScreens, parseProject } from './project'
import { TEMPLATES } from './templates'
import type { Interaction, Project } from './types'

const nav = (target: string | null, action: Interaction['action'] = 'navigate'): Interaction => ({
  action,
  target,
  transition: 'instant',
  url: '',
})

function projectWithModes(): Project {
  const p = createProject('Test', 'app')
  p.modes = [
    { id: 'basic', name: 'Básico', color: '#000' },
    { id: 'pro', name: 'Pro', color: '#111' },
    { id: 'premium', name: 'Premium', color: '#222' },
  ]
  return p
}

describe('modos', () => {
  it('resuelve la base y los cambios de cada modo', () => {
    const el = createElement('text', { text: 'Plan Básico' })
    el.overrides.pro = { text: 'Plan Pro' }
    expect(resolveProps(el, 'basic').text).toBe('Plan Básico')
    expect(resolveProps(el, 'pro').text).toBe('Plan Pro')
  })

  it('edita la base con alcance «todos los modos»', () => {
    const el = createElement('text', { text: 'Hola' })
    writeProps(el, { text: 'Adiós' }, 'pro', 'all')
    expect(el.props.text).toBe('Adiós')
    expect(el.overrides.pro).toBeUndefined()
  })

  it('crea un cambio con alcance «solo este modo»', () => {
    const el = createElement('text', { text: 'Hola' })
    writeProps(el, { text: 'Solo Pro' }, 'pro', 'mode')
    expect(el.props.text).toBe('Hola')
    expect(el.overrides.pro).toEqual({ text: 'Solo Pro' })
  })

  it('edita el cambio existente aunque el alcance sea «todos»', () => {
    const el = createElement('rect', { x: 10 })
    el.overrides.pro = { x: 50 }
    writeProps(el, { x: 60 }, 'pro', 'all')
    expect(el.props.x).toBe(10)
    expect(el.overrides.pro).toEqual({ x: 60 })
  })

  it('elimina el cambio cuando vuelve a coincidir con la base', () => {
    const el = createElement('rect', { x: 10 })
    el.overrides.pro = { x: 50 }
    writeProps(el, { x: 10 }, 'pro', 'mode')
    expect(el.overrides.pro).toBeUndefined()
  })

  it('consolida la visibilidad cuando todos los modos coinciden', () => {
    const el = createElement('rect')
    const modes = ['basic', 'pro', 'premium']
    setVisibleInMode(el, 'basic', false, modes)
    expect(resolveProps(el, 'basic').hidden).toBe(true)
    expect(resolveProps(el, 'pro').hidden).toBe(false)
    setVisibleInMode(el, 'pro', false, modes)
    setVisibleInMode(el, 'premium', false, modes)
    expect(el.props.hidden).toBe(true)
    expect(el.overrides).toEqual({})
  })

  it('copia y elimina los cambios de un modo', () => {
    const p = projectWithModes()
    const el = createElement('text', { text: 'A' })
    el.overrides.pro = { text: 'B' }
    p.screens[0].elements.push(el)
    p.screens[0].excludedModes = ['pro']
    copyModeOverrides(p, 'pro', 'nuevo')
    expect(el.overrides.nuevo).toEqual({ text: 'B' })
    expect(p.screens[0].excludedModes).toContain('nuevo')
    removeModeFromProject(p, 'pro')
    expect(el.overrides.pro).toBeUndefined()
    expect(p.modes.map((m) => m.id)).not.toContain('pro')
    expect(p.screens[0].excludedModes).toEqual(['nuevo'])
  })
})

describe('flujos', () => {
  it('marca como roto un flujo hacia una pantalla que no existe en el modo', () => {
    const p = projectWithModes()
    const home = p.screens[0]
    const chat = createScreen('Chat', 500, 0, 393, 852)
    chat.excludedModes = ['basic']
    p.screens.push(chat)
    const btn = createElement('button', { interaction: nav(chat.id) })
    home.elements.push(btn)
    expect(computeFlows(p, 'pro')).toMatchObject([{ toScreenId: chat.id, broken: false }])
    expect(computeFlows(p, 'basic')).toMatchObject([{ toScreenId: chat.id, broken: true }])
  })

  it('usa la interacción propia de cada modo', () => {
    const p = projectWithModes()
    const a = createScreen('A', 500, 0, 100, 100)
    const b = createScreen('B', 900, 0, 100, 100)
    p.screens.push(a, b)
    const btn = createElement('button', { interaction: nav(a.id) })
    btn.overrides.premium = { interaction: nav(b.id) }
    p.screens[0].elements.push(btn)
    expect(computeFlows(p, 'basic')[0].toScreenId).toBe(a.id)
    expect(computeFlows(p, 'premium')[0].toScreenId).toBe(b.id)
  })

  it('incluye el avance automático de una pantalla', () => {
    const p = projectWithModes()
    const next = createScreen('Siguiente', 500, 0, 100, 100)
    next.excludedModes = ['basic']
    p.screens.push(next)
    p.screens[0].autoAdvance = { target: next.id, delay: 2000, transition: 'dissolve' }
    expect(computeFlows(p, 'pro')).toMatchObject([{ action: 'auto', fromElementId: '', toScreenId: next.id, broken: false }])
    expect(computeFlows(p, 'basic')[0].broken).toBe(true)
  })

  it('ignora elementos ocultos en el modo', () => {
    const p = projectWithModes()
    const a = createScreen('A', 500, 0, 100, 100)
    p.screens.push(a)
    const btn = createElement('button', { interaction: nav(a.id) })
    btn.overrides.basic = { hidden: true }
    p.screens[0].elements.push(btn)
    expect(computeFlows(p, 'basic')).toHaveLength(0)
    expect(computeFlows(p, 'pro')).toHaveLength(1)
  })
})

describe('navegación del prototipo', () => {
  const screens = [createScreen('A', 0, 0, 1, 1), createScreen('B', 0, 0, 1, 1), createScreen('M', 0, 0, 1, 1)]
  screens[2].excludedModes = ['basic']
  const [A, B, M] = screens.map((s) => s.id)

  it('navega, abre modales, vuelve y cierra', () => {
    let s = startNav(A)
    s = applyInteraction(s, nav(B), screens, 'pro')
    expect(s.stack).toEqual([A, B])
    s = applyInteraction(s, nav(M, 'overlay'), screens, 'pro')
    expect(s.overlay).toBe(M)
    s = applyInteraction(s, nav(null, 'back'), screens, 'pro')
    expect(s).toEqual({ stack: [A, B], overlay: null })
    s = applyInteraction(s, nav(null, 'back'), screens, 'pro')
    expect(s.stack).toEqual([A])
  })

  it('no navega a pantallas que no existen en el modo', () => {
    const s = startNav(A)
    expect(applyInteraction(s, nav(M), screens, 'basic')).toBe(s)
  })
})

describe('geometría', () => {
  it('ajusta un rectángulo al borde más cercano', () => {
    const snap = snapRect({ x: 103, y: 50, width: 20, height: 20 }, [{ x: 0, y: 0, width: 100, height: 300 }], 5)
    expect(snap.dx).toBe(-3)
    expect(snap.guides).toContainEqual({ axis: 'x', value: 100 })
  })

  it('redimensiona desde una esquina manteniendo la proporción', () => {
    const r = resizeRect({ x: 0, y: 0, width: 100, height: 50 }, 'se', 100, 0, true)
    expect(r).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('redimensiona desde la izquierda sin invertir el rectángulo', () => {
    const r = resizeRect({ x: 0, y: 0, width: 100, height: 50 }, 'w', 500, 0, false)
    expect(r.width).toBeGreaterThanOrEqual(1)
    expect(r.x + r.width).toBe(100)
  })
})

describe('proyectos', () => {
  it('al duplicar pantallas reescribe los destinos entre copias', () => {
    const a = createScreen('A', 0, 0, 1, 1)
    const b = createScreen('B', 0, 0, 1, 1)
    a.elements.push(createElement('button', { interaction: nav(b.id) }))
    b.autoAdvance = { target: a.id, delay: 1000, transition: 'instant' }
    const { screens } = cloneScreens([a, b])
    expect(screens[0].id).not.toBe(a.id)
    expect(screens[0].elements[0].props.interaction?.target).toBe(screens[1].id)
    expect(screens[1].autoAdvance?.target).toBe(screens[0].id)
  })

  it('importa un proyecto exportado y valida el formato', () => {
    const original = TEMPLATES[0].build()
    const imported = parseProject(JSON.parse(JSON.stringify({ format: 'hilo', version: 1, project: original })))
    expect(imported.id).not.toBe(original.id)
    expect(imported.screens).toHaveLength(original.screens.length)
    expect(imported.modes).toEqual(original.modes)
    expect(() => parseProject({ foo: 1 })).toThrow()
  })

  it('la plantilla de psicología cambia los flujos según el plan', () => {
    const p = TEMPLATES[0].build()
    const [esencial, plus, premium] = p.modes.map((m) => m.id)
    const chat = p.screens.find((s) => s.name === 'Chat')!
    const video = p.screens.find((s) => s.name === 'Videollamada')!
    const toChat = (mode: string) => computeFlows(p, mode).some((f) => f.toScreenId === chat.id)
    const toVideo = (mode: string) => computeFlows(p, mode).some((f) => f.toScreenId === video.id)
    expect(toChat(esencial)).toBe(false)
    expect(toChat(plus)).toBe(true)
    expect(toVideo(plus)).toBe(false)
    expect(toVideo(premium)).toBe(true)
    for (const m of p.modes) expect(computeFlows(p, m.id).filter((f) => f.broken)).toEqual([])
  })
})
