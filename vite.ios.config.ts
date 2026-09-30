import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { assertProductionOrigin } from "./scripts/ios-release-config.mjs";

// iOS ships its own bundled assets. The Cloudflare plugin belongs only to the
// server/web build; neither remote HTML nor a development server ships in the app.
export default defineConfig(({ mode }) => {
  const demo = mode === "ios-demo";
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  function httpsOrigin(name: string) {
    const value = env[name];
    if (!value) throw new Error(`Missing iOS configuration: ${name}`);
    return assertProductionOrigin(value, name);
  }
  const apiOrigin = demo
    ? "http://127.0.0.1:5173"
    : httpsOrigin("VITE_API_ORIGIN");
  const publicOrigin = demo
    ? "https://sidequest-me.aaron-9c3.workers.dev"
    : httpsOrigin("VITE_PUBLIC_ORIGIN");
  if (!demo) {
    httpsOrigin("VITE_SUPABASE_URL");
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
    if (!key || key.startsWith("sb_secret_") || key.includes("YOUR_"))
      throw new Error("Set a public Supabase publishable key for the iOS app");
    if (key.split(".").length === 3) {
      const claims = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (claims.role !== "anon")
        throw new Error("Server Supabase keys cannot enter the iOS app");
    } else if (!key.startsWith("sb_publishable_")) {
      throw new Error("Invalid public Supabase key format");
    }
  }
  return {
    plugins: [
      react(),
      {
        name: "sidequest-native-build-record",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "native-build.json",
            source: JSON.stringify({
              platform: "ios",
              environment: demo ? "demo" : "production",
              apiOrigin,
              publicOrigin,
              builtAt: new Date().toISOString(),
            }),
          });
        },
      },
    ],
    define: {
      "import.meta.env.VITE_NATIVE": "true",
      "import.meta.env.VITE_DEMO_MODE": JSON.stringify(demo),
      "import.meta.env.VITE_API_ORIGIN": JSON.stringify(apiOrigin),
      "import.meta.env.VITE_NATIVE_DEMO_API_ORIGIN": JSON.stringify(
        demo ? apiOrigin : "",
      ),
      "import.meta.env.VITE_PUBLIC_ORIGIN": JSON.stringify(publicOrigin),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        demo ? "" : env.VITE_SUPABASE_URL,
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        demo ? "" : env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ),
    },
    build: { outDir: "dist-ios", emptyOutDir: true, sourcemap: false },
  };
});
