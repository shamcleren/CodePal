import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(projectRoot, "src/main/preload/index.ts"),
      },
    },
  },
  renderer: {},
});
