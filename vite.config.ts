import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['iptv.jarvis-icebo.duckdns.org'],
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1402',
        changeOrigin: true,
        secure: false,
      },
      '/playlist.json': {
        target: 'http://localhost:1402',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    allowedHosts: ['iptv.jarvis-icebo.duckdns.org'],
    host: true,
    proxy: {
        '/api': {
          target: 'http://localhost:1402',
          changeOrigin: true,
          secure: false,
        },
        '/playlist.json': {
          target: 'http://localhost:1402',
          changeOrigin: true,
          secure: false,
        }
      }
  }
})