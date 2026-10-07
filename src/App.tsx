import { Editor } from './editor/Editor'
import { Toasts } from './editor/Dialogs'
import { Home } from './home/Home'
import { useStore } from './store/store'

export default function App() {
  const openId = useStore((s) => s.openId)
  return (
    <>
      {openId ? <Editor /> : <Home />}
      <Toasts />
    </>
  )
}
