import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // This section is for 'npm run dev'
  server: {
    allowedHosts: ['iptv.jarvis-icebo.duckdns.org'],
    host: true
  },
  // This section is for 'npm run preview' (Streamflix typically uses this)
  preview: {
    allowedHosts: ['iptv.jarvis-icebo.duckdns.org'],
    host: true
  }
})