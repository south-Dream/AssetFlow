import { defineConfig } from "vite";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  base: "./",
  build: { outDir: "dist/ui" },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
