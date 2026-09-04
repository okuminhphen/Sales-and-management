import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/chart.js")) return "charts";
          if (id.includes("node_modules/react-bootstrap") || id.includes("node_modules/bootstrap")) return "bootstrap";
          if (id.includes("node_modules/@reduxjs") || id.includes("node_modules/react-redux")) return "state";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-router")) return "react";
          return undefined;
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/uploads": "http://localhost:8080",
      "/socket.io": {
        target: "http://localhost:8080",
        ws: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"]
  }
});
