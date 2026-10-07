import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas para que el build funcione desde cualquier carpeta.
  base: './',
  plugins: [react()],
})
