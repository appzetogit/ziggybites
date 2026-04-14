import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function getBackendUrl(apiBaseUrl) {
  return apiBaseUrl.replace(/\/api\/?$/, "");
}

function mapPublicFirebaseConfig(data = {}) {
  return {
    apiKey: data.FIREBASE_API_KEY || "",
    authDomain: data.FIREBASE_AUTH_DOMAIN || "",
    projectId: data.FIREBASE_PROJECT_ID || "",
    storageBucket: data.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: data.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: data.FIREBASE_APP_ID || "",
  };
}

function firebaseConfigPlugin(apiBaseUrl, env) {
  const getFirebaseConfig = () => ({
    apiKey: env.VITE_FIREBASE_API_KEY || "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.VITE_FIREBASE_APP_ID || "",
  });

  return {
    name: "firebase-config",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/firebase-config.json" || req.url === "/firebase-config.json/") {
          try {
            const base = getBackendUrl(apiBaseUrl);
            const r = await fetch(`${base}/api/env/public`);
            const json = await r.json();
            const config = mapPublicFirebaseConfig(json?.data);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(config));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({}));
          }
          return;
        }
        next();
      });
    },
    async generateBundle() {
      let config = getFirebaseConfig();

      try {
        const base = getBackendUrl(apiBaseUrl);
        const r = await fetch(`${base}/api/env/public`);
        const json = await r.json();
        const backendConfig = mapPublicFirebaseConfig(json?.data);
        if (backendConfig.projectId && backendConfig.appId) {
          config = backendConfig;
        }
      } catch (error) {
        this.warn(
          `Could not fetch Firebase config from backend for service worker config. Falling back to VITE_FIREBASE_* env values. ${error?.message || error}`,
        );
      }

      this.emitFile({
        type: "asset",
        fileName: "firebase-config.json",
        source: JSON.stringify(config),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.VITE_API_BASE_URL || "http://localhost:5000/api";

  return {
    plugins: [react(), tailwindcss(), firebaseConfigPlugin(apiBaseUrl, env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: [
        "@emotion/react",
        "@emotion/styled",
        "@mui/material",
        "@mui/x-date-pickers",
        "mapbox-gl",
        "react-map-gl",
      ],
    },
    server: {
      host: "0.0.0.0", // Allow access from network
      port: 5173, // Default Vite port
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
    },
  };
});
