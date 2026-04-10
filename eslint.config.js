import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".worktrees/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/out/**",
      "**/release/**",
      "scripts/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
