import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendTarget = process.env.ORYNVAE_BACKEND_URL ?? "http://127.0.0.1:9001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 9002,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
