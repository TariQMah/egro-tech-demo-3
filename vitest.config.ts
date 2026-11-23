import { defineConfig } from "vitest/config";
import { XCAN_LIB, XCAN_ROOT, xcanExtensionPlugin } from "./xcan.config";
import path from "node:path";

// Tests run in Node with the real fs/zlib/crypto; only the XCAN extension hook is applied.
export default defineConfig({
  plugins: [xcanExtensionPlugin()],
  define: { __XCAN_COMMIT__: JSON.stringify("test") },
  resolve: {
    alias: [
      { find: /^@xcan\/(.*)$/, replacement: `${XCAN_LIB}/$1` },
      { find: "@xcan-assets", replacement: path.join(XCAN_ROOT, "assets") },
    ],
  },
  test: {
    pool: "forks",
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
  },
});
