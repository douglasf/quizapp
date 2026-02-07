import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/quizapp/',
  server: {
    // Listen on all network interfaces so phones on the same WiFi can connect
    host: true,
  },
})
