import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import type { Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Location of the XCAN E-Rechnung source (sibling folder). Override with XCAN_ROOT. */
export const XCAN_ROOT = path.resolve(process.env.XCAN_ROOT || path.join(here, "..", "devoreo-erechnung"));
export const XCAN_LIB = path.join(XCAN_ROOT, "src", "lib");
const EXTENSION = path.join(here, "src", "xcan", "xrechnung-ext.ts");

/**
 * XCAN's ZUGFeRD generator embeds the XML from its own "./xrechnung-generator". This plugin points that
 * one import at the demo's extension module, so the embedded XML carries the same additions
 * (order reference, article numbers) as the standalone XRechnung. XCAN's source stays untouched.
 */
export function xcanExtensionPlugin(): Plugin {
  return {
    name: "xcan-extension",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./xrechnung-generator" && importer && importer.replace(/\\/g, "/").endsWith("/src/lib/zugferd-generator.ts")) {
        return EXTENSION;
      }
      return null;
    },
  };
}

/** `import data from "file?base64"` → the file's bytes as a base64 string (fonts, sample PDF). */
export function base64Plugin(): Plugin {
  return {
    name: "base64-import",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith("?base64")) return null;
      const resolved = await this.resolve(source.slice(0, -7), importer, { skipSelf: true });
      return resolved ? `${resolved.id}?base64` : null;
    },
    load(id) {
      if (!id.endsWith("?base64")) return null;
      const file = id.slice(0, -7);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(fs.readFileSync(file).toString("base64"))};`;
    },
  };
}
