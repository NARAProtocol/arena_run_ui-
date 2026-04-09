import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/arena/",
  plugins: [react()],
  build: {
    outDir: "dist/arena",
  },
  server: {
    port: 4173,
  },
});
