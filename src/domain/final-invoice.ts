/**
 * Final invoice (Schlussrechnung) after advance payments, § 14 Abs. 5 Satz 2 UStG:
 * the full contract value is invoiced, and the advance invoices are deducted with their net amount
 * and their VAT. In the e-invoice the deduction is a line with quantity −1 per advance invoice
 * (the net price stays positive, BR-27) plus a reference to the advance invoice (BT-25).
 * VAT in the XML therefore equals the VAT still owed (6.650,00 €).
 */
import { calculateInvoiceTotals, round2 } from "@xcan/calculations";
import type { ExtInvoiceData } from "../xcan/xrechnung-ext";
import { ADVANCE_INVOICES, CUSTOMER, CUSTOMER_ORDER, ERGO_TEC, PAYMENTS, type AdvanceInvoice, type CustomerOrder, type Payment } from "./data";

export interface FinalInvoiceInput {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
}

export interface AdvanceDeduction {
  advance: AdvanceInvoice;
  payments: Payment[];
  paidGross: number;
  fullyPaid: boolean;
}

export interface FinalCalculation {
  total: { net: number; vat: number; gross: number };
  deductions: AdvanceDeduction[];
  deducted: { net: number; vat: number; gross: number };
  remaining: { net: number; vat: number; gross: number };
  vatRate: number;
}

const de = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => iso.split("-").reverse().join(".");

export function deductionsFor(order: CustomerOrder, advances = ADVANCE_INVOICES, payments = PAYMENTS): AdvanceDeduction[] {
  return advances
    .filter((a) => a.orderNumber === order.number)
    .map((advance) => {
      const p = payments.filter((x) => x.invoiceNumber === advance.number);
      const paidGross = round2(p.reduce((s, x) => s + x.amount, 0));
      return { advance, payments: p, paidGross, fullyPaid: paidGross + 0.005 >= advance.gross };
    });
}

export function calculateFinal(order: CustomerOrder = CUSTOMER_ORDER): FinalCalculation {
  const { totals } = calculateInvoiceTotals(
    order.lines.map((l, i) => ({ position: i + 1, ...l })),
    false
  );
  const deductions = deductionsFor(order);
  const deducted = {
    net: round2(deductions.reduce((s, d) => s + d.advance.net, 0)),
    vat: round2(deductions.reduce((s, d) => s + d.advance.vat, 0)),
    gross: round2(deductions.reduce((s, d) => s + d.advance.gross, 0)),
  };
  const remainingNet = round2(totals.netTotal - deducted.net);
  const rate = order.lines[0].vatRate;
  const remainingVat = round2(remainingNet * (rate / 100));
  return {
    total: { net: totals.netTotal, vat: totals.vatTotal, gross: totals.grossTotal },
    deductions,
    deducted,
    remaining: { net: remainingNet, vat: remainingVat, gross: round2(remainingNet + remainingVat) },
    vatRate: rate,
  };
}

export function buildFinalInvoice(input: FinalInvoiceInput, order: CustomerOrder = CUSTOMER_ORDER): ExtInvoiceData {
  const calc = calculateFinal(order);
  const lines = [
    ...order.lines.map((l) => ({ ...l })),
    ...calc.deductions.map((d) => ({
      description: `Abzgl. Abschlag ${d.advance.number}`,
      quantity: -1,
      unit: "Stück",
      unitPrice: d.advance.net,
      vatRate: d.advance.vatRate as 19 | 7 | 0,
    })),
  ];
  const { calculatedItems, totals } = calculateInvoiceTotals(
    lines.map((l, i) => ({ position: i + 1, ...l })),
    false
  );
  const first = calc.deductions[0]?.advance;
  return {
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    deliveryDate: order.servicePeriod.to,
    dueDate: input.dueDate,
    paymentTerms: `Zahlbar bis ${fmtDate(input.dueDate)} ohne Abzug.`,
    isKleinunternehmer: false,
    notes: [
      `Schlussrechnung zu ${order.number}.`,
      ...calc.deductions.map((d) => `Verrechnet: ${d.advance.number}, netto ${de(d.advance.net)} €, USt ${de(d.advance.vat)} €.`),
    ].join(" "),
    precedingInvoice: first ? { number: first.number, issueDate: first.date } : null,
    orderReference: order.customerPo,
    contractReference: order.contract,
    seller: { ...ERGO_TEC },
    buyer: {
      name: CUSTOMER.name,
      contactPerson: CUSTOMER.contactPerson,
      street: CUSTOMER.street,
      zipCity: CUSTOMER.zipCity,
      country: CUSTOMER.country,
      vatId: CUSTOMER.vatId,
      email: CUSTOMER.email,
    },
    items: calculatedItems,
    totals,
  };
}
