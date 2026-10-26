import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets tests import "@/..." the same way the app does (see tsconfig paths).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
