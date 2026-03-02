import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

// Read version from package.json to inject as env variable
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))


// Stamp sw.js with a unique build ID and inject asset list for pre-caching
function swBuildStamp() {
  return {
    name: 'sw-build-stamp',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      try {
        let content = readFileSync(swPath, 'utf-8')
        const buildId = Date.now().toString(36)
        content = content.replace('__BUILD_ID__', buildId)

        // Pre-cache only the entry bundle, vendor chunks, and CSS — NOT lazy-loaded page chunks.
        // Lazy chunks are cached on first visit by the SW fetch handler.
        const assetsDir = resolve(__dirname, 'dist/assets')
        try {
          const files = readdirSync(assetsDir)
          const assets = files
            .filter(f => {
              if (f.endsWith('.css')) return true
              if (!f.endsWith('.js')) return false
              // Include entry bundle and vendor chunks; exclude lazy-loaded page chunks
              return f.startsWith('index-') || f.startsWith('vendor-') || f.startsWith('_commonjs')
            })
            .map(f => `/assets/${f}`)
          content = content.replace("'__PRECACHE_ASSETS__'", JSON.stringify(assets))
        } catch { /* no assets dir */ }

        writeFileSync(swPath, content)
      } catch { /* dev mode — no dist */ }
    },
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    swBuildStamp(),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-dexie': ['dexie', 'dexie-react-hooks'],
          'vendor-datefns': ['date-fns'],
        },
      },
    },
  },
})
