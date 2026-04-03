import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "child_process";

const version = (() => {
  try {
    return execSync("git describe --tags --always", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mammoth: ["mammoth"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
