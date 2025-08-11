import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    // Conditional proxy for workshop/external environments
    proxy: process.env.VITE_USE_PROXY === 'true' ? {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        secure: false,
      }
    } : undefined,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
