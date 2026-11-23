/**
 * Writes the supplier e-invoices of scenario 1 to data/samples/ using XCAN's generators.
 * Run: npm run samples
 */
import fs from "node:fs";
import path from "node:path";
import { XCAN_ROOT } from "../xcan.config";

const out = path.resolve("data/samples");
fs.mkdirSync(out, { recursive: true });
const demoRoot = process.cwd();
process.chdir(XCAN_ROOT); // XCAN's PDF generator loads its fonts relative to the working directory

const { generateXRechnungXml } = await import("../src/xcan/xrechnung-ext");
const { generateZugferdPdf } = await import("@xcan/zugferd-generator");
const { SUPPLIER_INVOICE, SUPPLIER_CORRECTION, SAMPLE_FILES } = await import("../src/domain/samples");

fs.writeFileSync(path.join(out, SAMPLE_FILES.invoiceXml), generateXRechnungXml(SUPPLIER_INVOICE));
fs.writeFileSync(path.join(out, SAMPLE_FILES.correctionXml), generateXRechnungXml(SUPPLIER_CORRECTION));
fs.writeFileSync(path.join(out, SAMPLE_FILES.invoicePdf), await generateZugferdPdf(SUPPLIER_INVOICE));
process.chdir(demoRoot);
console.log("Musterdateien geschrieben:", fs.readdirSync(out).join(", "));
