import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // Prevent Vite from reloading the app when alerts.json is written at runtime
      ignored: ["**/TradeMirror_Alert_Test/**"],
    },
  },
});