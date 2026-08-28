import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Keep root-level PWA assets available in production, but never fail a build
// because an optional asset is missing. This is important for partial uploads
// and repository updates where a favicon/icon may temporarily be absent.
const ROOT_ASSETS = [
  "favicon.ico",
  "favicon.svg",
  "favicon-16.png",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
  "sw.js",
  "offline.html",
];

function copyRootAssets() {
  let outDir;
  return {
    name: "copy-root-assets",
    configResolved(config) {
      outDir = path.resolve(rootDir, config.build.outDir);
    },
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      for (const name of ROOT_ASSETS) {
        const src = path.join(rootDir, name);
        const dest = path.join(outDir, name);
        if (!fs.existsSync(src)) {
          console.warn(`[copy-root-assets] optional asset missing: ${name}`);
          continue;
        }
        try {
          fs.copyFileSync(src, dest);
        } catch (error) {
          // Do not turn an optional icon/manifest into a failed deployment.
          console.warn(`[copy-root-assets] could not copy ${name}: ${error.message}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyRootAssets()],
});
