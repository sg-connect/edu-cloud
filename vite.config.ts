import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("projects/frontend"),
  envDir: resolve("."),
  resolve: {
    alias: {
      "@edu/contracts": resolve("shared/contracts.ts"),
      "@edu/database": resolve("projects/database/src/index.ts"),
    },
  },
  plugins: [
    vinext({ appDir: resolve("projects/frontend") }),
    cloudflare({
      configPath: resolve("wrangler.jsonc"),
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      auxiliaryWorkers: [{ configPath: resolve("wrangler.backend.jsonc") }],
      persistState: { path: resolve(".wrangler/state") },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
});
