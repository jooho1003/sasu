import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";

const fromDesktop = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const publicConstants = {
  SASU_APP_URL: JSON.stringify(process.env.SASU_APP_URL ?? ""),
  SUPABASE_URL: JSON.stringify(process.env.SUPABASE_URL ?? ""),
  SUPABASE_ANON_KEY: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ""),
};

const aliases = {
  "@sasu/contracts": fromDesktop("../lib/contracts.ts"),
  "@sasu/review-audio": fromDesktop("../lib/adapters/review-audio.ts"),
};

export default defineConfig({
  main: {
    resolve: { alias: aliases },
    define: publicConstants,
  },
  preload: {
    resolve: { alias: aliases },
    define: publicConstants,
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    resolve: { alias: aliases },
    define: publicConstants,
  },
});
