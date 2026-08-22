import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  // 0.0.0.0 rather than "::" so this works on hosts without IPv6.
  server: { host: "0.0.0.0", port: 8080 },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
