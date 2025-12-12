import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'

// Plugin to copy legacy files to dist
function copyLegacyFiles() {
  return {
    name: 'copy-legacy-files',
    closeBundle() {
      const distDir = 'dist'

      // Files/folders to copy
      const toCopy = [
        'manifest.json',
        'sw.js',
        'icons',
        'css',
        'js',
        'netlify'
      ]

      // Copy individual HTML files (legacy MPA pages)
      const htmlFiles = readdirSync('.').filter(f => f.endsWith('.html') && f !== 'app.html')

      // Copy specific files
      toCopy.forEach(item => {
        const src = resolve('.', item)
        const dest = resolve(distDir, item)

        if (existsSync(src)) {
          const stat = statSync(src)
          if (stat.isDirectory()) {
            copyDirSync(src, dest)
          } else {
            copyFileSync(src, dest)
          }
        }
      })

      // Copy HTML files
      htmlFiles.forEach(file => {
        const src = resolve('.', file)
        const dest = resolve(distDir, file)
        if (existsSync(src)) {
          copyFileSync(src, dest)
        }
      })

      console.log('Legacy files copied to dist/')
    }
  }
}

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }
  const entries = readdirSync(src)
  for (const entry of entries) {
    const srcPath = resolve(src, entry)
    const destPath = resolve(dest, entry)
    const stat = statSync(srcPath)
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export default defineConfig({
  plugins: [react(), copyLegacyFiles()],
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(process.cwd(), 'app.html')
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'lucide-react']
  }
})
