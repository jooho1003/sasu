import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const serviceRoleImport = {
  name: "@/lib/supabase/service",
  message:
    "요청 경로에서 service role 금지 (ADR-024). 웹은 lib/supabase/server.ts, 슬랙 경유는 search_as를 써라.",
};

const companionImports = [
  {
    name: "@/lib/companion/device-context",
    message: "기기 Bearer 인증은 app/api/companion/**와 tests/**에서만 사용한다.",
  },
  {
    name: "@/lib/supabase/bearer",
    message: "Bearer Supabase 클라이언트는 app/api/companion/**와 tests/**에서만 사용한다.",
  },
];

function restrictedImports(paths) {
  return { "no-restricted-imports": ["error", { paths }] };
}

const serviceRoleAllowedFiles = [
  "lib/adapters/**",
  "lib/pipeline/**",
  "lib/jobs.ts",
  "lib/llm.ts",
  "app/api/jobs/**",
  "app/api/slack/**",
  "app/api/meetings/**",
  "app/api/notion/**",
  "scripts/**",
  "tests/**",
];

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: restrictedImports([serviceRoleImport, ...companionImports]),
  },
  {
    files: serviceRoleAllowedFiles,
    rules: restrictedImports(companionImports),
  },
  {
    files: ["app/api/companion/**"],
    rules: restrictedImports([serviceRoleImport]),
  },
  {
    files: ["lib/companion/device-context.ts"],
    rules: restrictedImports([serviceRoleImport]),
  },
  {
    files: ["tests/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", ".next-verify/**", ".vercel/**", "out/**", "node_modules/**", "test-results/**", "desktop/**"]),
]);
