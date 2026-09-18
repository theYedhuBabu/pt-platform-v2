import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read .env from the repo root so the frontend shares one env file with the
  // rest of the project. Only VITE_-prefixed keys reach client code; other
  // vars in that file (DB creds, ClickHouse, etc.) are never bundled.
  envDir: '../..',
  // Mirror the hub's production reverse proxies (internal/hub-api/handlers_proxy.go)
  // so VITE_GRAFANA_BASE_URL=/grafana also resolves on the dev server (:5173).
  // Grafana is served from its sub-path (GF_SERVER_SERVE_FROM_SUB_PATH=true), so
  // the /grafana prefix is passed through unchanged; ClickHouse serves at root.
  server: {
    proxy: {
      '/grafana': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/clickhouse': {
        target: 'http://localhost:8123',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/clickhouse/, ''),
      },
    },
  },
})
