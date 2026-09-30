import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "react/jsx-runtime"] },
  resolve: { alias: [
    { find: "next/navigation", replacement: resolve("scripts/review-controls-lab/navigation.ts") },
    { find: "next/link", replacement: resolve("scripts/review-controls-lab/link.tsx") },
    { find: "@/lib/supabase/browser", replacement: resolve("scripts/review-controls-lab/storage.ts") },
    { find: "@", replacement: resolve(".") },
  ] },
  server: { fs: { allow: [resolve(".")] }, preTransformRequests: false },
});
