import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // ensure lucide-svelte is bundled for production/Electron
  optimizeDeps: {
    include: ["lucide-svelte"],
  },
  ssr: {
    // don’t externalize lucide-svelte in SSR/Electron builds
    noExternal: ["lucide-svelte"],
  },
});
