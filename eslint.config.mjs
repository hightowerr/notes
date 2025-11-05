import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      ".pnp",
      ".pnp.*",
      ".yarn/**",
      ".vercel/**",
      ".claude/**",
      ".gemini/**",
      ".codex/**",
      ".env*",
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      ".pnpm-debug.log*",
      "*.pem",
      "*.tsbuildinfo",
      "next-env.d.ts",
      ".DS_Store",
      "*Zone.Identifier",
      "*dropbox.attrs",
    ],
  },
];

export default eslintConfig;
