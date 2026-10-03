import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from https://contactvenkatd.github.io/forge-ui/ on GitHub Pages.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/forge-ui/' : '/',
  plugins: [react(), tailwindcss()],
}))
