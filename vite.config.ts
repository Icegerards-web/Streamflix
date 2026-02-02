import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['iptv.jarvis-icebo.duckdns.org'],
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:1402',
        changeOrigin: true,
        secure: false,
      },
      '/playlist.json': {
        target: 'http://127.0.0.1:1402',
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
          target: 'http://127.0.0.1:1402',
          changeOrigin: true,
          secure: false,
        },
        '/playlist.json': {
          target: 'http://127.0.0.1:1402',
          changeOrigin: true,
          secure: false,
        }
      }
  }
})