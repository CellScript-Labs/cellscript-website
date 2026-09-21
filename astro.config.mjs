import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://cellscript.dev",
  base: "/",
  output: "static",
  devToolbar: {
    enabled: false,
  },
  vite: {
    resolve: {
      alias: {
        buffer: "buffer/",
      },
    },
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      include: ["buffer"],
    },
  },
});
