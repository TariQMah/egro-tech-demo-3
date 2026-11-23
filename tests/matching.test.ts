import { describe, expect, it } from "vitest";
import { generateXRechnungXml } from "../src/xcan/xrechnung-ext";
import { generateZugferdPdf } from "@xcan/zugferd-generator";
import { importInvoice } from "../src/xcan/extract-ext";
import { threeWayMatch } from "../src/domain/matching";
import { FOLLOW_UP_RECEIPT, GOODS_RECEIPTS, PURCHASE_ORDER } from "../src/domain/data";
import { SUPPLIER_CORRECTION, SUPPLIER_INVOICE } from "../src/domain/samples";

const enc = (s: string) => new TextEncoder().encode(s);

describe("Eingangsrechnung: Import + Drei-Wege-Abgleich", () => {
  it("imports the XRechnung with order and article references and passes XCAN's EN 16931 check", async () => {
    const inv = await importInvoice(enc(generateXRechnungXml(SUPPLIER_INVOICE)), "re.xml");
    expect(inv.invoiceNumber).toBe("RE-MH-2026-0418");
    expect(inv.orderReference).toBe("4500012345");
    expect(inv.items.map((i) => i.sellerItemId)).toEqual(["MH-B-6000", "MH-HS-04", "MH-CB-24"]);
    expect(inv.items.map((i) => i.orderLineId)).toEqual(["10", "20", "30"]);
    expect(inv.netTotal).toBe(6525);
    expect(inv.vatTotal).toBe(1239.75);
    expect(inv.validationReport.isCompliant).toBe(true);
  });

  it("reads the same references from the ZUGFeRD PDF (embedded XML)", async () => {
    const pdf = await generateZugferdPdf(SUPPLIER_INVOICE);
    const inv = await importInvoice(pdf, "re.pdf");
    expect(inv.format).toContain("ZUGFeRD");
    expect(inv.orderReference).toBe("4500012345");
    expect(inv.items[0].sellerItemId).toBe("MH-B-6000");
  });

  it("flags the actuator line: 10 invoiced, 8 received", async () => {
    const inv = await importInvoice(enc(generateXRechnungXml(SUPPLIER_INVOICE)), "re.xml");
    const r = threeWayMatch(inv, PURCHASE_ORDER, GOODS_RECEIPTS);
    expect(r.ok).toBe(false);
    const bad = r.lines.filter((l) => l.issues.length);
    expect(bad).toHaveLength(1);
    expect(bad[0].articleNo).toBe("MH-B-6000");
    expect(bad[0].issues[0].status).toBe("MENGE_UEBER_WARENEINGANG");
    expect(r.overbilledNet).toBe(970);
    expect(r.overbilledGross).toBe(1154.3);
  });

  it("matches after the follow-up delivery is booked", async () => {
    const inv = await importInvoice(enc(generateXRechnungXml(SUPPLIER_INVOICE)), "re.xml");
    expect(threeWayMatch(inv, PURCHASE_ORDER, [...GOODS_RECEIPTS, FOLLOW_UP_RECEIPT]).ok).toBe(true);
  });

  it("matches the supplier's corrected invoice (384, 8 units)", async () => {
    const inv = await importInvoice(enc(generateXRechnungXml(SUPPLIER_CORRECTION)), "k.xml");
    expect(inv.typeCode).toBe("384");
    expect(inv.precedingInvoiceNumber).toBe("RE-MH-2026-0418");
    expect(threeWayMatch(inv, PURCHASE_ORDER, GOODS_RECEIPTS).ok).toBe(true);
  });

  it("detects price deviations and unknown order numbers", async () => {
    const xml = generateXRechnungXml({ ...SUPPLIER_INVOICE, orderReference: "4500099999" });
    const inv = await importInvoice(enc(xml), "x.xml");
    expect(threeWayMatch(inv, PURCHASE_ORDER, GOODS_RECEIPTS).header.find((h) => h.id === "PO")?.ok).toBe(false);
    const priced = { ...inv, items: inv.items.map((i, k) => (k === 1 ? { ...i, unitPrice: 41 } : i)) };
    const r = threeWayMatch({ ...priced, orderReference: "4500012345" }, PURCHASE_ORDER, [...GOODS_RECEIPTS, FOLLOW_UP_RECEIPT]);
    expect(r.lines[1].issues.map((i) => i.status)).toEqual(["PREISABWEICHUNG"]);
  });
});
