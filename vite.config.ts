import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/english/" : "/",
  plugins: [react()],
  server: {
    host: true,
    port: 4173
  },
  test: {
    environment: "node"
  }
}));
