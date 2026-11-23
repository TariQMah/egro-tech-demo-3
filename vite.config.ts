import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { XCAN_LIB, XCAN_ROOT, base64Plugin, xcanExtensionPlugin } from "./xcan.config";

let xcanCommit = "unbekannt";
try {
  xcanCommit = execSync("git describe --always --dirty", { cwd: XCAN_ROOT }).toString().trim();
} catch {}

const shim = (name: string) => path.resolve(__dirname, "src/shims", `${name}.ts`);

export default defineConfig({
  base: "./",
  plugins: [base64Plugin(), xcanExtensionPlugin(), react(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^@xcan\/(.*)$/, replacement: `${XCAN_LIB}/$1` },
      { find: "@xcan-assets", replacement: path.join(XCAN_ROOT, "assets") },
      // Node built-ins used by XCAN's libraries, replaced by small browser versions
      { find: /^(node:)?fs$/, replacement: shim("fs") },
      { find: /^(node:)?path$/, replacement: shim("path") },
      { find: /^(node:)?zlib$/, replacement: shim("zlib") },
      { find: /^(node:)?crypto$/, replacement: shim("crypto") },
    ],
  },
  server: { fs: { allow: [__dirname, XCAN_ROOT] } },
  define: { __XCAN_COMMIT__: JSON.stringify(xcanCommit), "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production") },
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 10_000 },
});
