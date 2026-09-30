import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { nearbyQuerySchema } from "./shared/events.ts";
import { searchNearbyEvents } from "./worker/events.ts";
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "demo"
      ? [
          {
            name: "sidequest-maps-config",
            configureServer(server: import("vite").ViteDevServer) {
              const eventKey = () =>
                process.env.TICKETMASTER_API_KEY ||
                loadEnv(mode, process.cwd(), "TICKETMASTER_")
                  .TICKETMASTER_API_KEY;
              server.middlewares.use("/api/events/config", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Cache-Control", "no-store");
                res.end(JSON.stringify({ configured: Boolean(eventKey()) }));
              });
              server.middlewares.use("/api/events/nearby", async (req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Cache-Control", "no-store");
                if (req.method !== "POST") {
                  res.statusCode = 405;
                  res.end("{}");
                  return;
                }
                let body = "";
                try {
                  for await (const chunk of req) {
                    body += String(chunk);
                    if (Buffer.byteLength(body) > 1024) {
                      res.statusCode = 413;
                      res.end("{}");
                      return;
                    }
                  }
                  const input = nearbyQuerySchema.safeParse(JSON.parse(body));
                  if (!input.success) {
                    res.statusCode = 422;
                    res.end("{}");
                    return;
                  }
                  res.end(
                    JSON.stringify(
                      await searchNearbyEvents(input.data, eventKey()),
                    ),
                  );
                } catch {
                  res.statusCode = 503;
                  res.end(
                    JSON.stringify({
                      error: "Nearby events are temporarily unavailable.",
                    }),
                  );
                }
              });
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
    // Only the explicitly installed local Simulator demo may use this origin.
    cors: mode === "demo" ? { origin: "capacitor://localhost" } : undefined,
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
              configure(proxy) {
                proxy.on("proxyReq", (proxyReq, req) => {
                  if (req.headers.origin === "capacitor://localhost")
                    proxyReq.setHeader("Origin", "http://127.0.0.1:5173");
                });
              },
            },
          }
        : undefined,
  },
  build: { sourcemap: false },
}));
