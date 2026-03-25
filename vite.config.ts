import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";
import { version } from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [cesium(), tailwindcss()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  server: {
    proxy: {
      "/api/nve": {
        target: "https://gts.nve.no",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nve/, "/api"),
      },
    },
  },
});
