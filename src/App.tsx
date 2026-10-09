import { Editor } from './editor/Editor'
import { Toasts } from './editor/Dialogs'
import { Home } from './home/Home'
import { useStore } from './store/store'

export default function App() {
  const openId = useStore((s) => s.openId)
  // Hasta leer los proyectos guardados (unos milisegundos) no se muestra nada,
  // para no enseñar un momento la lista vacía o el proyecto de ejemplo.
  const ready = useStore((s) => s.ready)
  if (!ready) return null
  return (
    <>
      {openId ? <Editor /> : <Home />}
      <Toasts />
    </>
  )
}
