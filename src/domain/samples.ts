/**
 * Supplier e-invoices for scenario 1, built with XCAN's calculation and generator code.
 * `scripts/generate-samples.ts` writes them to data/samples/ (XRechnung XML + ZUGFeRD PDF).
 */
import { calculateInvoiceTotals } from "@xcan/calculations";
import type { ExtInvoiceData } from "../xcan/xrechnung-ext";
import { ERGO_TEC, PURCHASE_ORDER, SUPPLIER } from "./data";

function supplierInvoice(opts: {
  number: string;
  issueDate: string;
  dueDate: string;
  quantities: Record<string, number>;
  typeCode?: "380" | "384";
  preceding?: { number: string; issueDate: string };
  notes: string;
}): ExtInvoiceData {
  const lines = PURCHASE_ORDER.lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    quantity: opts.quantities[l.articleNo] ?? l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    vatRate: l.vatRate,
  }));
  const { calculatedItems, totals } = calculateInvoiceTotals(lines, false);
  return {
    invoiceNumber: opts.number,
    issueDate: opts.issueDate,
    deliveryDate: "2026-11-04",
    dueDate: opts.dueDate,
    paymentTerms: "Zahlbar innerhalb von 30 Tagen ohne Abzug.",
    isKleinunternehmer: false,
    notes: opts.notes,
    typeCodeOverride: opts.typeCode,
    precedingInvoice: opts.preceding ?? null,
    orderReference: PURCHASE_ORDER.number,
    seller: { ...SUPPLIER },
    buyer: {
      name: ERGO_TEC.name,
      contactPerson: "A. Becker (Einkauf)",
      street: ERGO_TEC.street,
      zipCity: ERGO_TEC.zipCity,
      country: "DE",
      vatId: ERGO_TEC.vatId,
      email: "eingangsrechnungen@ergo-tec.example",
    },
    items: calculatedItems.map((it, i) => ({
      ...it,
      sellerItemId: PURCHASE_ORDER.lines[i].articleNo,
      orderLineId: PURCHASE_ORDER.lines[i].lineId,
    })),
    totals,
  };
}

/** Invoices all 10 actuators although only 8 were delivered. */
export const SUPPLIER_INVOICE = supplierInvoice({
  number: "RE-MH-2026-0418",
  issueDate: "2026-11-05",
  dueDate: "2026-12-05",
  quantities: {},
  notes: "Ihre Bestellung 4500012345 vom 12.10.2026, Lieferschein LS-MH-77120.",
});

/** Corrected invoice the supplier sends after the clarification request: 8 actuators. */
export const SUPPLIER_CORRECTION = supplierInvoice({
  number: "RE-MH-2026-0418-K1",
  issueDate: "2026-11-21",
  dueDate: "2026-12-21",
  quantities: { "MH-B-6000": 8 },
  typeCode: "384",
  preceding: { number: "RE-MH-2026-0418", issueDate: "2026-11-05" },
  notes: "Korrektur zu RE-MH-2026-0418: Hubantrieb MH-B nur 8 Stück geliefert.",
});

export const SAMPLE_FILES = {
  invoiceXml: "RE-MH-2026-0418_xrechnung.xml",
  invoicePdf: "RE-MH-2026-0418_zugferd.pdf",
  correctionXml: "RE-MH-2026-0418-K1_xrechnung.xml",
} as const;
