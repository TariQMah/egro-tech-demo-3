/**
 * Validation of a generated final invoice:
 *  1. XCAN's EN 16931 rule check (same engine as app.xcan.eu), in German and English
 *  2. additional EN 16931 arithmetic rules that matter for advance deductions (BR-27, BR-CO-10,
 *     BR-CO-14, BR-S-08, BR-CO-16) and the Schlussrechnung references
 *  3. round trip: the file is imported again with XCAN's extractor and the amounts are compared
 */
import { validateEn16931Xml, type ValidationReport } from "@xcan/validator/en16931-validator";
import { importInvoice } from "../xcan/extract-ext";
import { txt, type Txt } from "../i18n";
import type { FinalCalculation } from "./final-invoice";

export interface FinalCheck {
  id: string;
  label: Txt;
  ok: boolean;
  warning?: boolean;
  details?: Txt;
  source: "XCAN" | "Schlussrechnung" | "Rückimport";
}

const num = (s: string | undefined) => (s === undefined ? NaN : parseFloat(s));
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const eurDe = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurEn = (n: number) => "€" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Same sentence in both languages, differing only in number format. */
const both = (f: (eur: (n: number) => string) => string): Txt => txt(f(eurDe), f(eurEn));

export function additionalChecks(xml: string, calc: FinalCalculation, advanceNumbers: string[]): FinalCheck[] {
  const checks: FinalCheck[] = [];
  const add = (id: string, label: Txt, ok: boolean, details?: Txt) => checks.push({ id, label, ok, details, source: "Schlussrechnung" });

  const lines = xml.match(/<ram:IncludedSupplyChainTradeLineItem>[\s\S]*?<\/ram:IncludedSupplyChainTradeLineItem>/g) || [];
  const prices = lines.map((l) => num(l.match(/<ram:ChargeAmount>([-0-9.]+)</)?.[1]));
  const lineTotals = lines.map((l) => num(l.match(/<ram:LineTotalAmount>([-0-9.]+)</)?.[1]));
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  add(
    "BR-27",
    txt("Nettopreise nicht negativ", "Net prices not negative"),
    prices.every((p) => p >= 0),
    prices.some((p) => p < 0) ? txt("Ein Artikelpreis ist negativ", "An item price is negative") : undefined
  );

  const header = xml.match(/<ram:SpecifiedTradeSettlementHeaderMonetarySummation>[\s\S]*?<\/ram:SpecifiedTradeSettlementHeaderMonetarySummation>/)?.[0] || "";
  const h = (tag: string) => num(header.match(new RegExp(`<ram:${tag}[^>]*>([-0-9.]+)<`))?.[1]);
  const lineTotal = h("LineTotalAmount");
  const taxTotal = h("TaxTotalAmount");
  const grand = h("GrandTotalAmount");
  const due = h("DuePayableAmount");
  const prepaid = isNaN(h("TotalPrepaidAmount")) ? 0 : h("TotalPrepaidAmount");

  add(
    "BR-CO-10",
    txt("Summe der Positionen = Positionssumme", "Sum of lines = line total"),
    near(sum(lineTotals), lineTotal),
    both((e) => `${e(sum(lineTotals))} / ${e(lineTotal)}`)
  );

  const breakdowns =
    (xml.match(/<ram:ApplicableHeaderTradeSettlement>[\s\S]*<\/ram:ApplicableHeaderTradeSettlement>/)?.[0] || "").match(/<ram:ApplicableTradeTax>[\s\S]*?<\/ram:ApplicableTradeTax>/g) || [];
  const bd = breakdowns.map((b) => ({
    amount: num(b.match(/<ram:CalculatedAmount>([-0-9.]+)</)?.[1]),
    basis: num(b.match(/<ram:BasisAmount>([-0-9.]+)</)?.[1]),
    rate: num(b.match(/<ram:RateApplicablePercent>([-0-9.]+)</)?.[1]),
  }));
  add(
    "BR-CO-14",
    txt("USt-Gesamtbetrag = Summe der USt-Aufschlüsselung", "VAT total = sum of VAT breakdown"),
    near(sum(bd.map((b) => b.amount)), taxTotal),
    both((e) => e(taxTotal))
  );
  add(
    "BR-S-08",
    txt("USt je Steuersatz = Bemessungsgrundlage × Satz", "VAT per rate = taxable amount × rate"),
    bd.every((b) => near(Math.round(b.basis * b.rate) / 100, b.amount)),
    both((e) => bd.map((b) => `${e(b.basis)} × ${b.rate} % = ${e(b.amount)}`).join("; "))
  );
  add(
    "BR-CO-16",
    txt("Zahlbetrag = Bruttobetrag − Vorauszahlung", "Amount due = gross total − prepaid amount"),
    near(grand - prepaid, due),
    both((e) => `${e(grand)} − ${e(prepaid)} = ${e(due)}`)
  );

  const ref = xml.match(/<ram:InvoiceReferencedDocument>\s*<ram:IssuerAssignedID>([^<]+)</)?.[1];
  add(
    "BT-25",
    txt("Verweis auf Abschlagsrechnung", "Reference to advance invoice"),
    !!ref && advanceNumbers.includes(ref),
    ref ? txt(`Verweist auf ${ref}`, `Refers to ${ref}`) : txt("Kein Verweis vorhanden", "No reference present")
  );
  const po = xml.match(/<ram:BuyerOrderReferencedDocument>\s*<ram:IssuerAssignedID>([^<]+)</)?.[1];
  add("BT-13", txt("Bestellnummer des Kunden", "Customer's order number"), !!po, po ? txt(po, po) : txt("fehlt", "missing"));
  add(
    "§14(5)",
    txt("Restbetrag = Gesamtleistung − Abschläge", "Remaining amount = total − advance payments"),
    near(lineTotal, calc.remaining.net) && near(taxTotal, calc.remaining.vat) && near(due, calc.remaining.gross),
    txt(
      `netto ${eurDe(calc.total.net)} − ${eurDe(calc.deducted.net)} = ${eurDe(lineTotal)}; USt ${eurDe(calc.total.vat)} − ${eurDe(calc.deducted.vat)} = ${eurDe(taxTotal)}`,
      `net ${eurEn(calc.total.net)} − ${eurEn(calc.deducted.net)} = ${eurEn(lineTotal)}; VAT ${eurEn(calc.total.vat)} − ${eurEn(calc.deducted.vat)} = ${eurEn(taxTotal)}`
    )
  );
  add(
    "ABSCHLAG-BEZAHLT",
    txt("Abschlagszahlungen zugeordnet", "Advance payments matched"),
    calc.deductions.every((d) => d.fullyPaid),
    txt(
      calc.deductions.map((d) => `${d.advance.number}: ${eurDe(d.paidGross)} erhalten`).join("; "),
      calc.deductions.map((d) => `${d.advance.number}: ${eurEn(d.paidGross)} received`).join("; ")
    )
  );
  return checks;
}

export interface FinalValidation {
  xcanReport: ValidationReport;
  checks: FinalCheck[];
  ok: boolean;
}

export async function validateFinalInvoice(xml: string, calc: FinalCalculation, advanceNumbers: string[], pdf?: Uint8Array): Promise<FinalValidation> {
  const xcanReport = validateEn16931Xml(xml, "de");
  const xcanEn = validateEn16931Xml(xml, "en");
  const checks: FinalCheck[] = xcanReport.checks.map((c, i) => {
    const en = xcanEn.checks[i];
    return {
      id: c.id,
      label: txt(c.name, en?.name ?? c.name),
      ok: c.status !== "FAIL",
      warning: c.status === "WARN",
      details: c.details ? txt(c.details, en?.details ?? c.details) : undefined,
      source: "XCAN",
    };
  });
  checks.push(...additionalChecks(xml, calc, advanceNumbers));

  const roundTrip = async (bytes: Uint8Array, name: string, label: Txt) => {
    const id = `RT-${label.en.split(" ")[0]}`;
    const title = txt(`${label.de} mit XCAN wieder eingelesen`, `${label.en} re-imported with XCAN`);
    try {
      const back = await importInvoice(bytes, name);
      const ok = near(back.netTotal, calc.remaining.net) && near(back.vatTotal, calc.remaining.vat) && near(back.grossTotal, calc.remaining.gross) && back.validationReport.isCompliant;
      checks.push({
        id,
        label: title,
        ok,
        details: txt(
          `${back.format}: netto ${eurDe(back.netTotal)}, USt ${eurDe(back.vatTotal)}, brutto ${eurDe(back.grossTotal)}`,
          `${back.format}: net ${eurEn(back.netTotal)}, VAT ${eurEn(back.vatTotal)}, gross ${eurEn(back.grossTotal)}`
        ),
        source: "Rückimport",
      });
    } catch (e) {
      const msg = (e as Error).message;
      checks.push({ id, label: title, ok: false, details: txt(msg, msg), source: "Rückimport" });
    }
  };
  await roundTrip(new TextEncoder().encode(xml), "schlussrechnung.xml", txt("XRechnung", "XRechnung"));
  if (pdf) await roundTrip(pdf, "schlussrechnung.pdf", txt("ZUGFeRD-PDF", "ZUGFeRD PDF"));

  return { xcanReport, checks, ok: checks.every((c) => c.ok) };
}
