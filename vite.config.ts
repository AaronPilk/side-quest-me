import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "demo"
      ? [
          {
            name: "sidequest-maps-config",
            configureServer(server: import("vite").ViteDevServer) {
              server.middlewares.use("/api/maps/config", (_req, res) => {
                const token =
                  process.env.APPLE_MAPS_TOKEN ||
                  loadEnv(mode, process.cwd(), "APPLE_").APPLE_MAPS_TOKEN ||
                  null;
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Cache-Control", "no-store");
                res.end(JSON.stringify({ token }));
              });
            },
          },
        ]
      : []),
    ...(mode === "demo"
      ? []
      : [
          cloudflare(
            process.env.SIDEQUEST_CONFIG
              ? { configPath: process.env.SIDEQUEST_CONFIG }
              : undefined,
          ),
        ]),
  ],
  define: { "import.meta.env.VITE_DEMO_MODE": JSON.stringify(mode === "demo") },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/output/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
    proxy:
      mode === "demo"
        ? {
            "/api/local-media": {
              target: "http://127.0.0.1:8789",
              changeOrigin: true,
            },
          }
        : undefined,
  },
  build: { sourcemap: false },
}));
