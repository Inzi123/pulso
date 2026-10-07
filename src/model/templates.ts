import { createElement, createScreen, uid } from './defaults'
import type {
  DesignElement,
  ElementProps,
  ElementType,
  Id,
  Interaction,
  Mode,
  Overrides,
  Project,
  Screen,
  Transition,
} from './types'

export interface Template {
  id: string
  name: string
  description: string
  kind: Project['kind']
  build: () => Project
}

/* ---------- Pequeño DSL para construir pantallas ---------- */

type ModeKey = string

interface Opts extends Partial<ElementProps> {
  name?: string
  modes?: Record<ModeKey, Overrides>
  /** Solo visible en estos modos. */
  only?: ModeKey[]
}

function make(type: ElementType, x: number, y: number, w: number, h: number, o: Opts = {}): DesignElement {
  const { name, modes, only, ...props } = o
  const el = createElement(type, { x, y, width: w, height: h, ...props }, name)
  if (modes) for (const [m, ov] of Object.entries(modes)) el.overrides[m] = { ...ov }
  if (only) {
    el.props.hidden = true
    for (const m of only) el.overrides[m] = { ...el.overrides[m], hidden: false }
  }
  return el
}

const go = (target: Id, transition: Transition = 'slide-left'): Interaction => ({
  action: 'navigate',
  target,
  transition,
  url: '',
})
const overlay = (target: Id): Interaction => ({ action: 'overlay', target, transition: 'dissolve', url: '' })
const back: Interaction = { action: 'back', target: null, transition: 'slide-right', url: '' }
const close: Interaction = { action: 'close', target: null, transition: 'dissolve', url: '' }

/* ---------- Plantilla: plataforma de psicología ---------- */

const C = {
  bg: '#f3f6f4',
  card: '#ffffff',
  ink: '#1c2a27',
  muted: '#5e6e69',
  line: '#dde5e1',
  primary: '#2f6b5e',
  primarySoft: '#e2eee9',
  primaryMid: '#bfdcd1',
  amber: '#9a5b00',
  amberSoft: '#fdf0d9',
  violet: '#5b3fd1',
  violetSoft: '#ece6ff',
  danger: '#e5484d',
}

const HEAD = 'Fraunces'
const BODY = 'DM Sans'

function text(x: number, y: number, w: number, h: number, value: string, o: Opts = {}) {
  return make('text', x, y, w, h, { text: value, fontFamily: BODY, color: C.ink, fill: '', ...o })
}
function title(x: number, y: number, w: number, h: number, value: string, o: Opts = {}) {
  return text(x, y, w, h, value, { fontFamily: HEAD, fontSize: 28, fontWeight: 600, lineHeight: 1.15, ...o })
}
function button(x: number, y: number, w: number, h: number, value: string, o: Opts = {}) {
  return make('button', x, y, w, h, {
    text: value,
    fontFamily: BODY,
    fontSize: 16,
    fontWeight: 600,
    fill: C.primary,
    color: '#ffffff',
    radius: 16,
    ...o,
  })
}
function ghostButton(x: number, y: number, w: number, h: number, value: string, o: Opts = {}) {
  return button(x, y, w, h, value, { fill: 'transparent', color: C.primary, stroke: C.primary, strokeWidth: 1.5, ...o })
}
function rect(x: number, y: number, w: number, h: number, o: Opts = {}) {
  return make('rect', x, y, w, h, { fill: C.card, radius: 20, ...o })
}
function icon(x: number, y: number, size: number, name: string, o: Opts = {}) {
  return make('icon', x, y, size, size, { icon: name, color: C.ink, fill: '', name: `Icono ${name}`, ...o })
}
function circle(x: number, y: number, size: number, o: Opts = {}) {
  return make('ellipse', x, y, size, size, { fill: C.primarySoft, ...o })
}
function statusBar(color = C.ink): DesignElement[] {
  return [
    text(28, 16, 60, 20, '9:41', { fontSize: 15, fontWeight: 600, color, name: 'Hora', fontFamily: 'Geist' }),
    rect(339, 20, 26, 12, { fill: '', stroke: color, strokeWidth: 1.5, radius: 4, name: 'Batería', opacity: 0.8 }),
    rect(342, 23, 17, 6, { fill: color, radius: 2, name: 'Carga', opacity: 0.8 }),
  ]
}
function backArrow(color = C.ink) {
  return icon(20, 56, 28, 'arrow-left', { color, interaction: back, name: 'Atrás' })
}

function screen(name: string, col: number, row: number, elements: DesignElement[], o: Partial<Screen> = {}): Screen {
  const s = createScreen(name, col * 513, row * 1052, 393, 852)
  s.fill = C.bg
  s.elements = elements
  return Object.assign(s, o)
}

function buildPsychology(): Project {
  const ES = uid('mode')
  const PL = uid('mode')
  const PR = uid('mode')
  const modes: Mode[] = [
    { id: ES, name: 'Esencial', color: '#0f9d8a' },
    { id: PL, name: 'Plus', color: '#e08a00' },
    { id: PR, name: 'Premium', color: '#7b4dff' },
  ]

  // Se reservan los ids para poder enlazar pantallas antes de crearlas.
  const id = {
    welcome: uid('scr'),
    plans: uid('scr'),
    home: uid('scr'),
    book: uid('scr'),
    done: uid('scr'),
    upgrade: uid('scr'),
    chat: uid('scr'),
    video: uid('scr'),
    diary: uid('scr'),
  }

  const welcome = screen('Bienvenida', 0, 0, [
    ...statusBar(),
    text(0, 64, 393, 32, 'sereno', { fontFamily: HEAD, fontSize: 26, fontWeight: 600, color: C.primary, textAlign: 'center', name: 'Marca' }),
    circle(56, 128, 280, { name: 'Halo exterior' }),
    circle(106, 178, 180, { fill: C.primaryMid, name: 'Halo interior' }),
    icon(166, 238, 60, 'leaf', { color: C.primary, name: 'Ilustración' }),
    title(32, 450, 329, 84, 'Tu espacio para sentirte mejor', { fontSize: 34, textAlign: 'center', name: 'Titular' }),
    text(40, 548, 313, 48, 'Terapia online con psicólogos colegiados, a tu ritmo y desde donde estés.', {
      fontSize: 16, color: C.muted, textAlign: 'center', name: 'Descripción',
    }),
    button(24, 680, 345, 56, 'Crear cuenta', { interaction: go(id.plans), name: 'Crear cuenta' }),
    ghostButton(24, 748, 345, 56, 'Ya tengo cuenta', { interaction: go(id.home, 'dissolve'), name: 'Iniciar sesión' }),
  ])
  welcome.id = id.welcome

  const planCard = (y: number, h: number, mode: Id, name: string, price: string, perks: string, iconName: string) => [
    rect(24, y, 345, h, {
      stroke: C.line, strokeWidth: 1, name: `Tarjeta ${name}`,
      modes: { [mode]: { stroke: C.primary, strokeWidth: 2, shadow: 'md' } },
    }),
    icon(44, y + 22, 24, iconName, { color: C.primary }),
    text(78, y + 20, 160, 28, name, { fontFamily: HEAD, fontSize: 21, fontWeight: 600, name: `Nombre ${name}` }),
    text(44, y + 58, 220, 32, price, { fontSize: 24, fontWeight: 700, name: `Precio ${name}` }),
    text(44, y + 96, 300, h - 110, perks, { fontSize: 14, color: C.muted, name: `Incluye ${name}` }),
    make('button', 273, y + 20, 76, 26, {
      text: 'Tu plan', fontFamily: BODY, fontSize: 12, fontWeight: 600, fill: C.primary, color: '#fff',
      radius: 13, textAlign: 'center', only: [mode], name: `Insignia ${name}`,
    }),
  ]

  const plans = screen('Planes', 1, 0, [
    ...statusBar(),
    backArrow(),
    title(24, 100, 345, 36, 'Elige tu plan', { name: 'Título' }),
    text(24, 140, 345, 22, 'Puedes cambiarlo cuando quieras.', { fontSize: 15, color: C.muted, name: 'Subtítulo' }),
    ...planCard(184, 148, ES, 'Esencial', '29 € / mes', '1 sesión al mes · Diario emocional', 'leaf'),
    ...planCard(348, 148, PL, 'Plus', '59 € / mes', '4 sesiones al mes · Chat con tu psicóloga', 'chat'),
    ...planCard(512, 168, PR, 'Premium', '99 € / mes', 'Sesiones ilimitadas · Videollamada · Resumen semanal con IA', 'crown'),
    button(24, 740, 345, 56, 'Continuar', { interaction: go(id.home), name: 'Continuar' }),
  ])
  plans.id = id.plans

  const action = (x: number, y: number, label: string, sub: string, iconName: string, o: { interaction: Interaction; modes?: Record<Id, Overrides>; subModes?: Record<Id, Overrides>; lockOnly?: Id[] }) => [
    rect(x, y, 160, 124, { radius: 20, shadow: 'sm', interaction: o.interaction, modes: o.modes, name: `Acción ${label}` }),
    circle(x + 16, y + 16, 40, { name: `Fondo icono ${label}` }),
    icon(x + 26, y + 26, 20, iconName, { color: C.primary }),
    ...(o.lockOnly ? [icon(x + 124, y + 18, 18, 'lock', { color: C.muted, only: o.lockOnly, name: `Candado ${label}` })] : []),
    text(x + 16, y + 68, 136, 22, label, { fontSize: 15, fontWeight: 600, name: `Etiqueta ${label}` }),
    text(x + 16, y + 92, 136, 18, sub, { fontSize: 12, color: C.muted, modes: o.subModes, name: `Detalle ${label}` }),
  ]

  const navItem = (cx: number, label: string, iconName: string, active: boolean, interaction: Interaction | null, modes?: Record<Id, Overrides>) => [
    icon(cx - 12, 790, 24, iconName, { color: active ? C.primary : C.muted, fixed: true, interaction, modes, name: `Nav ${label}` }),
    text(cx - 40, 818, 80, 16, label, { fontSize: 11, fontWeight: active ? 600 : 400, color: active ? C.primary : C.muted, textAlign: 'center', fixed: true, name: `Nav texto ${label}` }),
  ]

  const chatAction: Interaction = overlay(id.upgrade)
  const home = screen('Inicio', 2, 0, [
    ...statusBar(),
    title(24, 60, 260, 36, 'Hola, Ana', { name: 'Saludo' }),
    icon(341, 66, 26, 'bell', { name: 'Notificaciones' }),
    make('button', 24, 104, 128, 28, {
      text: 'Plan Esencial', fontFamily: BODY, fontSize: 13, fontWeight: 600, radius: 14,
      fill: C.primarySoft, color: C.primary, textAlign: 'center', name: 'Plan actual', interaction: go(id.plans),
      modes: {
        [PL]: { text: 'Plan Plus', fill: C.amberSoft, color: C.amber },
        [PR]: { text: 'Plan Premium', fill: C.violetSoft, color: C.violet, width: 140 },
      },
    }),
    rect(24, 152, 345, 132, { fill: C.primary, radius: 22, name: 'Próxima sesión' }),
    text(44, 172, 300, 18, 'Próxima sesión', { fontSize: 13, color: '#ffffff', opacity: 0.8 }),
    text(44, 194, 300, 30, 'Jueves 10 · 18:00', { fontFamily: HEAD, fontSize: 24, fontWeight: 600, color: '#ffffff', name: 'Fecha sesión' }),
    text(44, 232, 300, 20, 'Con Laura Méndez, psicóloga', { fontSize: 14, color: '#ffffff', opacity: 0.9, name: 'Profesional' }),
    icon(44, 256, 16, 'video', { color: '#ffffff', only: [PR], name: 'Icono online' }),
    text(66, 254, 260, 20, 'Por videollamada', { fontSize: 13, color: '#ffffff', only: [PR], name: 'Modalidad' }),
    text(24, 296, 345, 20, 'Te queda 1 de 1 sesión este mes', {
      fontSize: 13, color: C.muted, name: 'Cupo de sesiones',
      modes: { [PL]: { text: 'Te quedan 3 de 4 sesiones este mes' }, [PR]: { text: 'Sesiones ilimitadas este mes' } },
    }),
    title(24, 332, 345, 28, '¿Qué necesitas hoy?', { fontSize: 20, name: 'Sección' }),
    ...action(24, 372, 'Agendar sesión', 'Reserva en 1 minuto', 'calendar', { interaction: go(id.book) }),
    ...action(209, 372, 'Diario', '¿Cómo te sientes?', 'book', { interaction: go(id.diary) }),
    ...action(24, 512, 'Chat', 'Disponible en Plus', 'chat', {
      interaction: chatAction,
      modes: { [PL]: { interaction: go(id.chat) }, [PR]: { interaction: go(id.chat) } },
      subModes: { [PL]: { text: 'Respuesta en 24 h' }, [PR]: { text: 'Respuesta en 2 h' } },
      lockOnly: [ES],
    }),
    ...action(209, 512, 'Videollamada', 'Disponible en Premium', 'video', {
      interaction: overlay(id.upgrade),
      modes: { [PR]: { interaction: go(id.video, 'dissolve') } },
      subModes: { [PR]: { text: 'Hoy a las 18:00' } },
      lockOnly: [ES, PL],
    }),
    rect(24, 652, 345, 92, {
      fill: C.amberSoft, radius: 18, name: 'Banner mejora', interaction: go(id.plans), only: [ES, PL],
    }),
    icon(44, 674, 22, 'crown', { color: C.amber, only: [ES, PL], name: 'Icono mejora' }),
    text(80, 670, 270, 60, 'Habla con tu psicóloga por chat entre sesiones. Mejora a Plus →', {
      fontSize: 14, color: C.amber, fontWeight: 500, only: [ES, PL], name: 'Texto mejora',
      modes: { [PL]: { text: 'Sesiones por videollamada y resumen con IA. Mejora a Premium →' } },
    }),
    rect(24, 652, 345, 92, { fill: C.violetSoft, radius: 18, name: 'Resumen IA', only: [PR], interaction: go(id.diary) }),
    icon(44, 674, 22, 'sparkles', { color: C.violet, only: [PR], name: 'Icono IA' }),
    text(80, 670, 270, 60, 'Tu semana: dormiste mejor y tu ánimo subió un 12 %. Ver resumen →', {
      fontSize: 14, color: C.violet, fontWeight: 500, only: [PR], name: 'Texto IA',
    }),
    rect(0, 768, 393, 84, { fill: C.card, radius: 0, fixed: true, name: 'Barra inferior' }),
    rect(0, 768, 393, 1, { fill: C.line, radius: 0, fixed: true, name: 'Separador barra' }),
    ...navItem(49, 'Inicio', 'home', true, null),
    ...navItem(147, 'Sesiones', 'calendar', false, go(id.book)),
    ...navItem(245, 'Chat', 'chat', false, chatAction, { [PL]: { interaction: go(id.chat) }, [PR]: { interaction: go(id.chat) } }),
    ...navItem(344, 'Perfil', 'user', false, null),
  ])
  home.id = id.home

  const dayChip = (i: number, label: string, selected: boolean) =>
    make('button', 24 + i * 70, 318, 60, 72, {
      text: label, fontFamily: BODY, fontSize: 15, fontWeight: 600, lineHeight: 1.3, radius: 18,
      fill: selected ? C.primary : C.card, color: selected ? '#ffffff' : C.ink, textAlign: 'center',
      stroke: selected ? '' : C.line, strokeWidth: selected ? 0 : 1, name: `Día ${label.replace('\n', ' ')}`,
    })
  const slot = (i: number, label: string, selected: boolean) =>
    make('button', 24 + (i % 3) * 120, 446 + Math.floor(i / 3) * 56, 105, 44, {
      text: label, fontFamily: BODY, fontSize: 15, fontWeight: 600, radius: 12, textAlign: 'center',
      fill: selected ? C.primarySoft : C.card, color: selected ? C.primary : C.ink,
      stroke: selected ? C.primary : C.line, strokeWidth: selected ? 1.5 : 1, name: `Hora ${label}`,
    })

  const book = screen('Agendar sesión', 3, 0, [
    ...statusBar(),
    backArrow(),
    title(24, 100, 345, 34, 'Agendar sesión', { fontSize: 26, name: 'Título' }),
    text(24, 138, 345, 20, 'Tu plan incluye 1 sesión al mes', {
      fontSize: 14, color: C.muted, name: 'Cupo',
      modes: { [PL]: { text: 'Te quedan 3 sesiones este mes' }, [PR]: { text: 'Sesiones ilimitadas' } },
    }),
    rect(24, 176, 345, 88, { stroke: C.line, strokeWidth: 1, radius: 18, name: 'Profesional' }),
    circle(40, 192, 56, { fill: C.primaryMid, name: 'Avatar' }),
    text(40, 209, 56, 22, 'LM', { fontFamily: HEAD, fontSize: 18, fontWeight: 600, color: C.primary, textAlign: 'center', name: 'Iniciales' }),
    text(112, 198, 240, 22, 'Laura Méndez', { fontSize: 16, fontWeight: 600, name: 'Nombre' }),
    text(112, 222, 240, 20, 'Psicóloga sanitaria · TCC', { fontSize: 13, color: C.muted, name: 'Especialidad' }),
    text(24, 288, 345, 22, 'Elige un día', { fontSize: 15, fontWeight: 600, name: 'Etiqueta día' }),
    dayChip(0, 'Lun\n7', false),
    dayChip(1, 'Mar\n8', false),
    dayChip(2, 'Mié\n9', false),
    dayChip(3, 'Jue\n10', true),
    dayChip(4, 'Vie\n11', false),
    text(24, 414, 345, 22, 'Horarios disponibles', { fontSize: 15, fontWeight: 600, name: 'Etiqueta horas' }),
    ...['10:00', '12:30', '16:00', '17:30', '18:00', '19:30'].map((h, i) => slot(i, h, h === '18:00')),
    text(24, 570, 345, 22, 'Modalidad', { fontSize: 15, fontWeight: 600, name: 'Etiqueta modalidad' }),
    make('button', 24, 602, 166, 48, {
      text: 'Presencial', fontFamily: BODY, fontSize: 15, fontWeight: 600, radius: 12, textAlign: 'center',
      fill: C.primarySoft, color: C.primary, stroke: C.primary, strokeWidth: 1.5, name: 'Presencial',
    }),
    make('button', 203, 602, 166, 48, {
      text: 'Video · Premium', fontFamily: BODY, fontSize: 15, fontWeight: 600, radius: 12, textAlign: 'center',
      fill: C.card, color: C.ink, stroke: C.line, strokeWidth: 1, opacity: 0.45, name: 'Videollamada',
      modes: { [PR]: { text: 'Videollamada', opacity: 1 } },
    }),
    button(24, 740, 345, 56, 'Confirmar sesión', { interaction: go(id.done, 'slide-up'), name: 'Confirmar' }),
  ])
  book.id = id.book

  const done = screen('Sesión confirmada', 4, 0, [
    ...statusBar(),
    circle(146, 210, 100, { name: 'Círculo' }),
    icon(171, 235, 50, 'check', { color: C.primary, name: 'Check' }),
    title(24, 344, 345, 36, '¡Sesión agendada!', { textAlign: 'center', name: 'Título' }),
    text(24, 392, 345, 48, 'Jueves 10 de octubre · 18:00\nCon Laura Méndez', {
      fontSize: 16, color: C.muted, textAlign: 'center', name: 'Detalle',
    }),
    rect(24, 472, 345, 72, { fill: C.primarySoft, radius: 16, name: 'Aviso' }),
    icon(44, 496, 22, 'bell', { color: C.primary }),
    text(80, 484, 270, 48, 'Te enviaremos un recordatorio 24 horas antes.', {
      fontSize: 14, color: C.primary, name: 'Texto aviso',
      modes: { [PR]: { text: 'Te enviaremos el enlace de la videollamada 24 horas antes.' } },
    }),
    button(24, 740, 345, 56, 'Volver al inicio', { interaction: go(id.home, 'dissolve'), name: 'Volver' }),
  ])
  done.id = id.done

  const upgrade = createScreen('Mejorar plan (modal)', 513 + 24, 1052, 345, 420)
  upgrade.id = id.upgrade
  upgrade.fill = '#ffffff'
  upgrade.elements = [
    circle(140, 32, 64, { fill: C.amberSoft, name: 'Fondo icono' }),
    icon(156, 48, 32, 'lock', { color: C.amber, name: 'Candado' }),
    title(24, 116, 297, 64, 'Desbloquea el chat con tu psicóloga', {
      fontSize: 22, textAlign: 'center', name: 'Título',
      modes: { [PL]: { text: 'Sesiones por videollamada con Premium' } },
    }),
    text(28, 188, 289, 66, 'Con el plan Plus puedes escribirle cuando lo necesites y recibir respuesta en 24 horas.', {
      fontSize: 15, color: C.muted, textAlign: 'center', name: 'Descripción',
      modes: { [PL]: { text: 'Haz tus sesiones desde casa y recibe cada semana un resumen con IA.' } },
    }),
    button(24, 284, 297, 52, 'Ver planes', { interaction: go(id.plans), name: 'Ver planes' }),
    button(24, 344, 297, 48, 'Ahora no', { fill: 'transparent', color: C.muted, interaction: close, name: 'Cerrar' }),
  ]

  const bubble = (x: number, y: number, w: number, h: number, value: string, mine: boolean, o: Opts = {}) => [
    rect(x, y, w, h, { fill: mine ? C.primary : C.card, radius: 18, name: mine ? 'Mensaje propio' : 'Mensaje', ...o }),
    text(x + 16, y + 12, w - 32, h - 24, value, { fontSize: 15, color: mine ? '#ffffff' : C.ink, name: 'Texto mensaje', ...o }),
  ]

  const chat = screen('Chat', 2, 1, [
    ...statusBar(),
    backArrow(),
    circle(60, 50, 40, { fill: C.primaryMid, name: 'Avatar' }),
    text(60, 60, 40, 20, 'LM', { fontFamily: HEAD, fontSize: 14, fontWeight: 600, color: C.primary, textAlign: 'center' }),
    text(112, 50, 200, 22, 'Laura Méndez', { fontSize: 16, fontWeight: 600, name: 'Nombre' }),
    text(112, 72, 200, 18, 'En línea', { fontSize: 12, color: C.primary, name: 'Estado' }),
    rect(0, 108, 393, 1, { fill: C.line, radius: 0, name: 'Separador' }),
    text(24, 124, 345, 18, 'Tu psicóloga responde en menos de 24 horas', {
      fontSize: 12, color: C.muted, textAlign: 'center', name: 'Tiempo de respuesta',
      modes: { [PR]: { text: 'Respuesta prioritaria en menos de 2 horas' } },
    }),
    ...bubble(24, 160, 270, 88, 'Hola Ana, ¿cómo te has sentido desde la última sesión?', false),
    ...bubble(139, 264, 230, 64, 'Mejor, esta semana he dormido más.', true),
    ...bubble(24, 344, 290, 88, 'Me alegra. Probemos el ejercicio de respiración antes de dormir.', false),
    rect(0, 760, 393, 92, { fill: C.card, radius: 0, fixed: true, name: 'Barra de escritura' }),
    make('input', 16, 776, 297, 48, {
      text: 'Escribe un mensaje…', fontFamily: BODY, fontSize: 15, radius: 24, fill: C.bg, stroke: C.line,
      strokeWidth: 1, color: C.muted, fixed: true, name: 'Campo mensaje',
    }),
    circle(321, 776, 48, { fill: C.primary, fixed: true, name: 'Enviar' }),
    icon(333, 788, 24, 'arrow-right', { color: '#ffffff', fixed: true, name: 'Icono enviar' }),
  ], { excludedModes: [ES] })
  chat.id = id.chat

  const callBtn = (cx: number, iconName: string, fill: string, o: Opts = {}) => [
    circle(cx - 32, 720, 64, { fill, name: `Botón ${iconName}`, ...o }),
    icon(cx - 13, 739, 26, iconName, { color: '#ffffff', name: `Icono ${iconName}` }),
  ]
  const video = screen('Videollamada', 3, 1, [
    rect(0, 0, 393, 852, { fill: 'linear-gradient(165deg, #2f6b5e 0%, #10201c 75%)', radius: 0, name: 'Fondo' }),
    ...statusBar('#ffffff'),
    rect(269, 64, 100, 140, { fill: '#3e5a53', radius: 16, name: 'Tu cámara' }),
    icon(299, 114, 40, 'user', { color: '#bfdcd1', name: 'Tú' }),
    circle(121, 250, 150, { fill: C.primaryMid, name: 'Avatar' }),
    text(121, 298, 150, 56, 'LM', { fontFamily: HEAD, fontSize: 48, fontWeight: 600, color: C.primary, textAlign: 'center' }),
    title(24, 428, 345, 32, 'Laura Méndez', { fontSize: 24, color: '#ffffff', textAlign: 'center', name: 'Nombre' }),
    text(24, 466, 345, 22, '12:48', { fontSize: 16, color: '#ffffff', opacity: 0.7, textAlign: 'center', name: 'Duración', fontFamily: 'Geist Mono' }),
    ...callBtn(104, 'mic', 'rgba(255,255,255,.16)'),
    ...callBtn(196, 'video', 'rgba(255,255,255,.16)'),
    ...callBtn(288, 'phone', C.danger, { interaction: go(id.home, 'dissolve') }),
  ], { excludedModes: [ES, PL], fill: '#10201c' })
  video.id = id.video

  const mood = (i: number, iconName: string, label: string, selected: boolean) => [
    circle(36 + i * 116, 184, 88, {
      fill: selected ? C.primary : C.card, stroke: selected ? '' : C.line, strokeWidth: selected ? 0 : 1,
      name: `Ánimo ${label}`,
    }),
    icon(60 + i * 116, 208, 40, iconName, { color: selected ? '#ffffff' : C.muted }),
    text(36 + i * 116, 280, 88, 20, label, { fontSize: 14, textAlign: 'center', color: selected ? C.primary : C.muted, fontWeight: selected ? 600 : 400 }),
  ]
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const levels = [40, 56, 36, 70, 82, 64, 90]
  const diary = screen('Diario emocional', 4, 1, [
    ...statusBar(),
    backArrow(),
    title(24, 100, 345, 64, '¿Cómo te sientes hoy?', { fontSize: 26, name: 'Título' }),
    ...mood(0, 'frown', 'Mal', false),
    ...mood(1, 'meh', 'Regular', false),
    ...mood(2, 'smile', 'Bien', true),
    make('input', 24, 324, 345, 52, {
      text: 'Hoy me sentí…', fontFamily: BODY, fontSize: 15, radius: 14, fill: C.card, stroke: C.line,
      strokeWidth: 1, color: C.muted, name: 'Nota',
    }),
    text(24, 400, 345, 22, 'Tu semana', { fontSize: 15, fontWeight: 600, name: 'Etiqueta semana' }),
    rect(24, 432, 345, 176, { stroke: C.line, strokeWidth: 1, radius: 18, name: 'Gráfico' }),
    ...levels.map((h, i) =>
      rect(48 + i * 46, 572 - h, 24, h, { fill: i === 6 ? C.primary : C.primaryMid, radius: 6, name: `Barra ${days[i]}` }),
    ),
    ...days.map((d, i) => text(48 + i * 46, 580, 24, 18, d, { fontSize: 12, color: C.muted, textAlign: 'center', name: `Día ${d}` })),
    rect(24, 628, 345, 88, { fill: C.violetSoft, radius: 18, only: [PR], name: 'Análisis IA' }),
    icon(44, 652, 22, 'sparkles', { color: C.violet, only: [PR] }),
    text(80, 644, 272, 60, 'Tu ánimo mejora los días que sales a caminar. ¿Lo comentamos en tu próxima sesión?', {
      fontSize: 14, color: C.violet, only: [PR], name: 'Texto IA',
    }),
    rect(24, 628, 345, 88, { fill: '#e9eeec', radius: 18, only: [ES, PL], interaction: go(id.plans), name: 'Análisis bloqueado' }),
    icon(44, 652, 22, 'lock', { color: C.muted, only: [ES, PL] }),
    text(80, 644, 272, 60, 'Análisis semanal con IA. Disponible en Premium →', {
      fontSize: 14, color: C.muted, fontWeight: 500, only: [ES, PL], name: 'Texto bloqueado',
    }),
    button(24, 752, 345, 56, 'Guardar entrada', { interaction: back, name: 'Guardar' }),
  ])
  diary.id = id.diary

  const now = Date.now()
  return {
    id: uid('prj'),
    name: 'Sereno · Terapia online',
    kind: 'app',
    viewportHeight: 852,
    modes,
    screens: [welcome, plans, home, book, done, upgrade, chat, video, diary],
    startScreenId: id.welcome,
    createdAt: now,
    updatedAt: now,
  }
}

/* ---------- Plantilla: web con modos de facturación ---------- */

function buildWebPricing(): Project {
  const MONTH = uid('mode')
  const YEAR = uid('mode')
  const modes: Mode[] = [
    { id: MONTH, name: 'Mensual', color: '#1f7ae0' },
    { id: YEAR, name: 'Anual', color: '#0f9d8a' },
  ]
  const landingId = uid('scr')
  const pricingId = uid('scr')
  const signupId = uid('scr')
  const W = 1440

  const nav = (active: string) => [
    rect(0, 0, W, 76, { fill: '#ffffff', radius: 0, name: 'Cabecera' }),
    rect(0, 76, W, 1, { fill: C.line, radius: 0, name: 'Separador' }),
    text(80, 22, 200, 32, 'sereno', { fontFamily: HEAD, fontSize: 26, fontWeight: 600, color: C.primary, name: 'Logo', interaction: go(landingId, 'dissolve') }),
    text(860, 28, 120, 22, 'Cómo funciona', { fontSize: 15, color: active === 'how' ? C.primary : C.ink, name: 'Menú cómo funciona' }),
    text(1000, 28, 70, 22, 'Precios', { fontSize: 15, color: active === 'pricing' ? C.primary : C.ink, fontWeight: active === 'pricing' ? 600 : 400, interaction: go(pricingId, 'dissolve'), name: 'Menú precios' }),
    button(1180, 18, 180, 42, 'Empezar ahora', { fontSize: 15, radius: 12, interaction: go(signupId, 'dissolve'), name: 'CTA cabecera' }),
  ]

  const landing: Screen = {
    ...createScreen('Inicio web', 0, 0, W, 1100),
    id: landingId,
    fill: C.bg,
    elements: [
      ...nav('how'),
      title(80, 190, 640, 160, 'Terapia online que se adapta a tu vida', { fontSize: 60, lineHeight: 1.08, name: 'Titular' }),
      text(80, 380, 560, 60, 'Psicólogos colegiados, sesiones por videollamada o chat y un diario emocional para acompañarte entre sesiones.', { fontSize: 19, color: C.muted, name: 'Descripción' }),
      button(80, 476, 220, 56, 'Ver planes', { interaction: go(pricingId), name: 'CTA principal' }),
      ghostButton(316, 476, 220, 56, 'Cómo funciona', { name: 'CTA secundario' }),
      circle(860, 150, 460, { name: 'Ilustración' }),
      circle(950, 240, 280, { fill: C.primaryMid }),
      icon(1040, 330, 100, 'leaf', { color: C.primary }),
      ...[['shield', 'Profesionales verificados'], ['clock', 'Primera sesión en 48 h'], ['heart', 'Sin permanencia']].map(([ic, label], i) => [
        rect(80 + i * 432, 720, 400, 140, { radius: 24, stroke: C.line, strokeWidth: 1, name: `Ventaja ${label}` }),
        icon(112 + i * 432, 752, 32, ic, { color: C.primary }),
        text(112 + i * 432, 800, 340, 30, label, { fontSize: 20, fontWeight: 600 }),
      ]).flat(),
    ],
  }

  const tier = (i: number, name: string, monthly: string, yearly: string, perks: string, highlight = false) => {
    const x = 80 + i * 432
    return [
      rect(x, 330, 400, 520, {
        radius: 28, stroke: highlight ? C.primary : C.line, strokeWidth: highlight ? 2 : 1, shadow: highlight ? 'lg' : 'none',
        name: `Plan ${name}`,
      }),
      text(x + 36, 370, 300, 34, name, { fontFamily: HEAD, fontSize: 28, fontWeight: 600 }),
      text(x + 36, 424, 330, 56, monthly, {
        fontSize: 44, fontWeight: 700, name: `Precio ${name}`,
        modes: { [YEAR]: { text: yearly } },
      }),
      text(x + 36, 484, 330, 22, 'al mes, facturado mensualmente', {
        fontSize: 15, color: C.muted, name: `Facturación ${name}`,
        modes: { [YEAR]: { text: 'al mes, facturado anualmente' } },
      }),
      text(x + 36, 540, 330, 200, perks, { fontSize: 17, lineHeight: 1.8, color: C.ink, name: `Incluye ${name}` }),
      button(x + 36, 762, 328, 56, 'Elegir plan', {
        fill: highlight ? C.primary : 'transparent', color: highlight ? '#ffffff' : C.primary,
        stroke: highlight ? '' : C.primary, strokeWidth: highlight ? 0 : 1.5, interaction: go(signupId), name: `Elegir ${name}`,
      }),
    ]
  }

  const pricing: Screen = {
    ...createScreen('Precios', W + 160, 0, W, 1000),
    id: pricingId,
    fill: C.bg,
    elements: [
      ...nav('pricing'),
      title(0, 150, W, 70, 'Planes para cada momento', { fontSize: 52, textAlign: 'center', name: 'Título' }),
      text(0, 232, W, 28, 'Cambia o cancela cuando quieras.', {
        fontSize: 19, color: C.muted, textAlign: 'center', name: 'Subtítulo',
        modes: { [YEAR]: { text: 'Pagando el año completo ahorras dos meses.' } },
      }),
      ...tier(0, 'Esencial', '29 €', '24 €', '✓ 1 sesión al mes\n✓ Diario emocional\n✓ Ejercicios guiados'),
      ...tier(1, 'Plus', '59 €', '49 €', '✓ 4 sesiones al mes\n✓ Chat con tu psicóloga\n✓ Todo lo de Esencial', true),
      ...tier(2, 'Premium', '99 €', '82 €', '✓ Sesiones ilimitadas\n✓ Videollamada\n✓ Resumen semanal con IA'),
      make('button', 1176, 280, 184, 32, {
        text: '2 meses gratis', fontFamily: BODY, fontSize: 14, fontWeight: 600, radius: 16, textAlign: 'center',
        fill: C.primarySoft, color: C.primary, only: [YEAR], name: 'Insignia ahorro',
      }),
    ],
  }

  const signup: Screen = {
    ...createScreen('Registro', (W + 160) * 2, 0, W, 1000),
    id: signupId,
    fill: C.bg,
    elements: [
      ...nav(''),
      rect(470, 150, 500, 640, { radius: 28, shadow: 'md', name: 'Formulario' }),
      title(518, 196, 404, 40, 'Crea tu cuenta', { fontSize: 32 }),
      text(518, 244, 404, 22, 'Plan Plus · 59 € al mes', {
        fontSize: 15, color: C.muted, name: 'Resumen plan',
        modes: { [YEAR]: { text: 'Plan Plus · 588 € al año' } },
      }),
      text(518, 300, 404, 20, 'Nombre', { fontSize: 14, fontWeight: 600 }),
      make('input', 518, 326, 404, 50, { text: 'Ana García', fontFamily: BODY, fontSize: 15, radius: 12, name: 'Campo nombre' }),
      text(518, 396, 404, 20, 'Correo electrónico', { fontSize: 14, fontWeight: 600 }),
      make('input', 518, 422, 404, 50, { text: 'ana@correo.com', fontFamily: BODY, fontSize: 15, radius: 12, name: 'Campo correo' }),
      text(518, 492, 404, 20, 'Contraseña', { fontSize: 14, fontWeight: 600 }),
      make('input', 518, 518, 404, 50, { text: '••••••••', fontFamily: BODY, fontSize: 15, radius: 12, name: 'Campo contraseña' }),
      button(518, 608, 404, 56, 'Crear cuenta', { name: 'Crear cuenta' }),
      text(518, 690, 404, 44, 'Al continuar aceptas las condiciones y la política de privacidad.', { fontSize: 13, color: C.muted, textAlign: 'center' }),
    ],
  }

  const now = Date.now()
  return {
    id: uid('prj'),
    name: 'Sereno · Web',
    kind: 'web',
    viewportHeight: 900,
    modes,
    screens: [landing, pricing, signup],
    startScreenId: landingId,
    createdAt: now,
    updatedAt: now,
  }
}

export const TEMPLATES: Template[] = [
  {
    id: 'psychology-app',
    name: 'Plataforma de psicología',
    description: 'App móvil con tres planes (Esencial, Plus y Premium) que cambian pantallas y flujos.',
    kind: 'app',
    build: buildPsychology,
  },
  {
    id: 'pricing-web',
    name: 'Web con precios',
    description: 'Landing, precios y registro con modos de facturación mensual y anual.',
    kind: 'web',
    build: buildWebPricing,
  },
]
