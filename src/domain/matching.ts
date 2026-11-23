/**
 * Three-way matching: invoice ↔ purchase order ↔ goods receipts.
 * Invoice lines are tied to PO lines by referenced PO line (BT-132), then article number (BT-155),
 * then by identical description. Quantities and prices are compared per line.
 */
import type { GoodsReceipt, PurchaseOrder } from "./data";
import type { ImportedInvoice } from "../xcan/extract-ext";
import { txt, type Txt } from "../i18n";

export type LineStatus = "OK" | "MENGE_UEBER_WARENEINGANG" | "MENGE_UEBER_BESTELLUNG" | "PREISABWEICHUNG" | "NICHT_BESTELLT" | "STEUERSATZ";

export interface LineIssue {
  status: Exclude<LineStatus, "OK">;
  message: Txt;
}

export interface LineMatch {
  position: number;
  articleNo?: string;
  description: string;
  orderLineId?: string;
  ordered: number | null;
  received: number;
  invoiced: number;
  orderPrice: number | null;
  invoicePrice: number;
  /** Net amount invoiced beyond what was received or ordered at the order price (≥ 0). */
  overbilledNet: number;
  issues: LineIssue[];
}

export interface HeaderCheck {
  id: string;
  label: Txt;
  ok: boolean;
  details: Txt;
}

export interface MatchResult {
  ok: boolean;
  header: HeaderCheck[];
  lines: LineMatch[];
  openOrderLines: Array<{ lineId: string; articleNo: string; description: string; ordered: number; received: number }>;
  overbilledNet: number;
  overbilledGross: number;
  receiptsUsed: string[];
  ranAt: string;
}

export const PRICE_TOLERANCE = 0.005; // 0.5 % of the order price
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function threeWayMatch(invoice: ImportedInvoice, order: PurchaseOrder | null, receipts: GoodsReceipt[]): MatchResult {
  const header: HeaderCheck[] = [];
  header.push({
    id: "PO",
    label: txt("Bestellbezug (BT-13)", "Order reference (BT-13)"),
    ok: Boolean(order && invoice.orderReference === order.number),
    details: invoice.orderReference
      ? order && invoice.orderReference === order.number
        ? txt(`Bestellung ${order.number} gefunden`, `Purchase order ${order.number} found`)
        : txt(`Bestellnummer ${invoice.orderReference} ist nicht bekannt`, `Order number ${invoice.orderReference} is unknown`)
      : txt("Rechnung enthält keine Bestellnummer", "Invoice contains no order number"),
  });

  if (!order) {
    return { ok: false, header, lines: [], openOrderLines: [], overbilledNet: 0, overbilledGross: 0, receiptsUsed: [], ranAt: new Date().toISOString() };
  }

  const supplierOk = norm(invoice.senderName) === norm(order.supplier) || (!!invoice.senderVatId && invoice.senderVatId === order.supplierVatId);
  header.push({
    id: "SUPPLIER",
    label: txt("Lieferant", "Supplier"),
    ok: supplierOk,
    details: supplierOk
      ? txt(`${invoice.senderName} (${invoice.senderVatId ?? "ohne USt-IdNr."})`, `${invoice.senderName} (${invoice.senderVatId ?? "no VAT ID"})`)
      : txt(`${invoice.senderName} ist nicht der Lieferant der Bestellung (${order.supplier})`, `${invoice.senderName} is not the supplier of the order (${order.supplier})`),
  });
  header.push({
    id: "CURRENCY",
    label: txt("Währung", "Currency"),
    ok: invoice.currency === "EUR",
    details: txt(invoice.currency, invoice.currency),
  });

  const relevantReceipts = receipts.filter((r) => r.orderNumber === order.number);
  header.push({
    id: "GR",
    label: txt("Wareneingang", "Goods receipt"),
    ok: relevantReceipts.length > 0,
    details: relevantReceipts.length
      ? txt(relevantReceipts.map((r) => `${r.number} (${r.deliveryNote})`).join(", "), relevantReceipts.map((r) => `${r.number} (${r.deliveryNote})`).join(", "))
      : txt("Kein Wareneingang zur Bestellung gebucht", "No goods receipt booked for this order"),
  });

  const receivedFor = (lineId: string) =>
    relevantReceipts.reduce((sum, r) => sum + r.lines.filter((l) => l.orderLineId === lineId).reduce((s, l) => s + l.quantity, 0), 0);

  const usedOrderLines = new Set<string>();
  const lines: LineMatch[] = invoice.items.map((it) => {
    const poLine =
      order.lines.find((l) => it.orderLineId && l.lineId === it.orderLineId) ||
      order.lines.find((l) => it.sellerItemId && l.articleNo === it.sellerItemId) ||
      order.lines.find((l) => norm(l.description) === norm(it.description));
    const issues: LineIssue[] = [];
    if (!poLine) {
      issues.push({ status: "NICHT_BESTELLT", message: txt("Position ist in der Bestellung nicht enthalten", "Item is not part of the purchase order") });
      return {
        position: it.position,
        articleNo: it.sellerItemId,
        description: it.description,
        ordered: null,
        received: 0,
        invoiced: it.quantity,
        orderPrice: null,
        invoicePrice: it.unitPrice,
        overbilledNet: round2(it.netTotal),
        issues,
      };
    }
    usedOrderLines.add(poLine.lineId);
    const received = receivedFor(poLine.lineId);
    const accepted = Math.min(received, poLine.quantity);
    const excessQty = Math.max(0, it.quantity - accepted);

    if (it.quantity > poLine.quantity) {
      issues.push({
        status: "MENGE_UEBER_BESTELLUNG",
        message: txt(`Berechnet ${it.quantity} ${poLine.unit}, bestellt nur ${poLine.quantity}`, `Invoiced ${it.quantity} units, only ${poLine.quantity} ordered`),
      });
    }
    if (it.quantity > received) {
      issues.push({
        status: "MENGE_UEBER_WARENEINGANG",
        message: txt(
          `Berechnet ${it.quantity} ${poLine.unit}, geliefert ${received} – ${it.quantity - received} ${poLine.unit} ohne Wareneingang`,
          `Invoiced ${it.quantity} units, delivered ${received} – ${it.quantity - received} units without goods receipt`
        ),
      });
    }
    const priceDiff = it.unitPrice - poLine.unitPrice;
    if (Math.abs(priceDiff) > poLine.unitPrice * PRICE_TOLERANCE) {
      issues.push({
        status: "PREISABWEICHUNG",
        message: txt(
          `Einzelpreis ${it.unitPrice.toFixed(2)} € statt ${poLine.unitPrice.toFixed(2)} € laut Bestellung`,
          `Unit price €${it.unitPrice.toFixed(2)} instead of €${poLine.unitPrice.toFixed(2)} per purchase order`
        ),
      });
    }
    if (it.vatRate !== poLine.vatRate) {
      issues.push({ status: "STEUERSATZ", message: txt(`USt ${it.vatRate} % statt ${poLine.vatRate} %`, `VAT ${it.vatRate}% instead of ${poLine.vatRate}%`) });
    }
    const overbilled = excessQty * Math.max(it.unitPrice, 0) + Math.max(0, priceDiff) * Math.min(it.quantity, accepted);
    return {
      position: it.position,
      articleNo: it.sellerItemId ?? poLine.articleNo,
      description: it.description,
      orderLineId: poLine.lineId,
      ordered: poLine.quantity,
      received,
      invoiced: it.quantity,
      orderPrice: poLine.unitPrice,
      invoicePrice: it.unitPrice,
      overbilledNet: issues.length ? round2(overbilled) : 0,
      issues,
    };
  });

  const openOrderLines = order.lines
    .filter((l) => !usedOrderLines.has(l.lineId))
    .map((l) => ({ lineId: l.lineId, articleNo: l.articleNo, description: l.description, ordered: l.quantity, received: receivedFor(l.lineId) }));

  const overbilledNet = round2(lines.reduce((s, l) => s + l.overbilledNet, 0));
  const overbilledGross = round2(
    lines.reduce((s, l) => {
      const rate = invoice.items.find((i) => i.position === l.position)?.vatRate ?? 0;
      return s + round2(l.overbilledNet * (1 + rate / 100));
    }, 0)
  );

  const ok = header.every((h) => h.ok) && lines.every((l) => l.issues.length === 0);
  return { ok, header, lines, openOrderLines, overbilledNet, overbilledGross, receiptsUsed: relevantReceipts.map((r) => r.number), ranAt: new Date().toISOString() };
}
