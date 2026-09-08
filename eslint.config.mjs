import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const serviceRoleImportRule = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@/lib/supabase/service",
          message:
            "요청 경로에서 service role 금지 (ADR-024). 웹은 lib/supabase/server.ts, 슬랙 경유는 search_as를 써라.",
        },
      ],
    },
  ],
};

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
    rules: serviceRoleImportRule,
  },
  {
    files: serviceRoleAllowedFiles,
    rules: {
      "no-restricted-imports": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "node_modules/**"]),
]);
