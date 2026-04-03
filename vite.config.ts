import { defineConfig } from "vite";

/** 仅打包 app/ 源码；node_modules 与 Node 内置模块在运行时解析 */
function isExternal(id: string): boolean {
  if (id.startsWith("node:")) return true;
  if (id.startsWith(".") || id.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/.test(id)) return false;
  if (!id.includes("node_modules") && /[\\/]app[\\/]/.test(id)) return false;
  if (id.startsWith("app/") || id.startsWith("app\\")) return false;
  return true;
}

export default defineConfig({
  build: {
    target: "node20",
    ssr: true,
    outDir: "dist",
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      input: "app/index.ts",
      output: {
        entryFileNames: "index.js",
        format: "es",
      },
      external: isExternal,
    },
  },
});
