/** Everything the demo UI uses from XCAN, in one place. */
import "./browser";
export { generateXRechnungXml } from "./xrechnung-ext";
export type { ExtInvoiceData } from "./xrechnung-ext";
export { generateZugferdPdf } from "@xcan/zugferd-generator";
export { importInvoice } from "./extract-ext";
export type { ImportedInvoice } from "./extract-ext";
export { base64ToBytes, bytesToBase64 } from "./browser";
export const XCAN_ENGINE = { name: "XCAN E-Rechnung", source: "devoreo-erechnung", commit: __XCAN_COMMIT__ };
