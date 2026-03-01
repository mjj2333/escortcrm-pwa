import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Stamp sw.js with a unique build ID so the cache auto-busts on each deploy
function swBuildStamp() {
  return {
    name: 'sw-build-stamp',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      try {
        const content = readFileSync(swPath, 'utf-8')
        const buildId = Date.now().toString(36)
        writeFileSync(swPath, content.replace('__BUILD_ID__', buildId))
      } catch { /* dev mode — no dist */ }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    swBuildStamp(),
  ],
})
