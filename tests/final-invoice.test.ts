import { describe, expect, it } from "vitest";
import { generateXRechnungXml } from "../src/xcan/xrechnung-ext";
import { generateZugferdPdf } from "@xcan/zugferd-generator";
import { buildFinalInvoice, calculateFinal } from "../src/domain/final-invoice";
import { validateFinalInvoice } from "../src/domain/validate-final";

const input = { invoiceNumber: "SR-2026-0019", issueDate: "2026-11-23", dueDate: "2026-12-23" };

describe("Schlussrechnung", () => {
  it("calculates 50.000 − 15.000 = 35.000 net and 6.650 VAT", () => {
    const c = calculateFinal();
    expect(c.total).toEqual({ net: 50000, vat: 9500, gross: 59500 });
    expect(c.deducted).toEqual({ net: 15000, vat: 2850, gross: 17850 });
    expect(c.remaining).toEqual({ net: 35000, vat: 6650, gross: 41650 });
    expect(c.deductions[0].fullyPaid).toBe(true);
  });

  it("generates an XRechnung with the deduction, references and correct totals", () => {
    const xml = generateXRechnungXml(buildFinalInvoice(input));
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toMatch(/<ram:InvoiceReferencedDocument>\s*<ram:IssuerAssignedID>AR-2026-0007</);
    expect(xml).toMatch(/<ram:BuyerOrderReferencedDocument>\s*<ram:IssuerAssignedID>BM-PO-7781</);
    expect(xml).toContain('<ram:BilledQuantity unitCode="C62">-1.00</ram:BilledQuantity>');
    expect(xml).toContain("<ram:LineTotalAmount>35000.00</ram:LineTotalAmount>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">6650.00</ram:TaxTotalAmount>');
    expect(xml).toContain("<ram:DuePayableAmount>41650.00</ram:DuePayableAmount>");
  });

  it("passes XCAN validation, the extra rules and the XML + PDF round trip", async () => {
    const data = buildFinalInvoice(input);
    const xml = generateXRechnungXml(data);
    const pdf = await generateZugferdPdf(data);
    const v = await validateFinalInvoice(xml, calculateFinal(), ["AR-2026-0007"], pdf);
    const failed = v.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(v.xcanReport.isCompliant).toBe(true);
  });

  it("fails BR-27 if a deduction were written with a negative price", async () => {
    const data = buildFinalInvoice(input);
    const bad = { ...data, items: data.items.map((i) => (i.quantity < 0 ? { ...i, quantity: 1, unitPrice: -15000 } : i)) };
    const v = await validateFinalInvoice(generateXRechnungXml(bad), calculateFinal(), ["AR-2026-0007"]);
    expect(v.checks.find((c) => c.id === "BR-27")?.ok).toBe(false);
  });
});
