/**
 * Prepared structured test data (stands in for ERP and accounting). All companies except the name
 * Ergo-Tec are fictional; tax IDs and IBANs are sample values.
 */

export interface Party {
  name: string;
  contactName?: string;
  street: string;
  zipCity: string;
  country: string;
  vatId?: string;
  taxNumber?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  email?: string;
  phone?: string;
}

export const ERGO_TEC: Party = {
  name: "Ergo-Tec GmbH",
  contactName: "Buchhaltung Ergo-Tec",
  street: "Gewerbestraße 2",
  zipCity: "91489 Wilhelmsdorf",
  country: "DE",
  vatId: "DE811234567",
  taxNumber: "218/123/45678",
  iban: "DE02120300000000202051",
  bic: "BYLADEM1001",
  bankName: "Musterbank",
  email: "rechnung@ergo-tec.example",
  phone: "+49 9104 0000-0",
};

export const SUPPLIER: Party = {
  name: "MusterHub Antriebstechnik GmbH",
  contactName: "Debitorenbuchhaltung MusterHub",
  street: "Spindelweg 8",
  zipCity: "12345 Musterstadt",
  country: "DE",
  vatId: "DE298765432",
  iban: "DE12500105170648489890",
  bic: "INGDDEFFXXX",
  bankName: "Musterbank Musterstadt",
  email: "rechnung@musterhub.example",
  phone: "+49 30 0000-100",
};

export const CUSTOMER: Party & { customerNumber: string; contactPerson: string } = {
  name: "BeispielMed GmbH",
  customerNumber: "K-10042",
  contactPerson: "Frau L. Schneider (Einkauf)",
  street: "Panoramastraße 12",
  zipCity: "12345 Musterstadt",
  country: "DE",
  vatId: "DE276543210",
  email: "eingangsrechnungen@beispielmed.example",
};

// ---------- Scenario 1: purchase order and goods receipts ----------

export interface PurchaseOrderLine {
  lineId: string;
  articleNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: 19 | 7 | 0;
}

export interface PurchaseOrder {
  number: string;
  date: string;
  supplier: string;
  supplierVatId: string;
  buyer: string;
  purpose: string;
  lines: PurchaseOrderLine[];
}

export const PURCHASE_ORDER: PurchaseOrder = {
  number: "4500012345",
  date: "2026-10-12",
  supplier: SUPPLIER.name,
  supplierVatId: SUPPLIER.vatId!,
  buyer: "A. Becker (Einkauf)",
  purpose: "Fertigung Untersuchungsliegen UL-01, Los 2026-11",
  lines: [
    { lineId: "10", articleNo: "MH-B-6000", description: "Elektrischer Hubantrieb MH-B, 6000 N", quantity: 10, unit: "Stück", unitPrice: 485, vatRate: 19 },
    { lineId: "20", articleNo: "MH-HS-04", description: "Handschalter 4-Tasten", quantity: 10, unit: "Stück", unitPrice: 38.5, vatRate: 19 },
    { lineId: "30", articleNo: "MH-CB-24", description: "Steuerbox 24 V", quantity: 10, unit: "Stück", unitPrice: 129, vatRate: 19 },
  ],
};

export interface GoodsReceipt {
  number: string;
  date: string;
  orderNumber: string;
  deliveryNote: string;
  receivedBy: string;
  lines: Array<{ orderLineId: string; articleNo: string; quantity: number }>;
}

export const GOODS_RECEIPTS: GoodsReceipt[] = [
  {
    number: "WE-2026-0981",
    date: "2026-11-04",
    orderNumber: "4500012345",
    deliveryNote: "LS-MH-77120",
    receivedBy: "K. Wolf (Wareneingang)",
    lines: [
      { orderLineId: "10", articleNo: "MH-B-6000", quantity: 8 },
      { orderLineId: "20", articleNo: "MH-HS-04", quantity: 10 },
      { orderLineId: "30", articleNo: "MH-CB-24", quantity: 10 },
    ],
  },
];

/** Follow-up delivery that the employee can book during clarification. */
export const FOLLOW_UP_RECEIPT: GoodsReceipt = {
  number: "WE-2026-1004",
  date: "2026-11-20",
  orderNumber: "4500012345",
  deliveryNote: "LS-MH-77188",
  receivedBy: "K. Wolf (Wareneingang)",
  lines: [{ orderLineId: "10", articleNo: "MH-B-6000", quantity: 2 }],
};

// ---------- Scenario 2: customer order, advance invoice, payment ----------

export interface CustomerOrder {
  number: string;
  customerPo: string;
  contract: string;
  date: string;
  title: string;
  servicePeriod: { from: string; to: string };
  lines: Array<{ description: string; quantity: number; unit: string; unitPrice: number; vatRate: 19 | 7 | 0 }>;
}

export const CUSTOMER_ORDER: CustomerOrder = {
  number: "AB-2026-0142",
  customerPo: "BM-PO-7781",
  contract: "V-2026-UL01",
  date: "2026-05-20",
  title: "Entwicklung und Fertigung Untersuchungsliege UL-01",
  servicePeriod: { from: "2026-06-01", to: "2026-11-13" },
  lines: [
    { description: "Entwicklung/Konstruktion UL-01 pauschal", quantity: 1, unit: "Stück", unitPrice: 18000, vatRate: 19 },
    { description: "Fertigung Untersuchungsliege UL-01", quantity: 10, unit: "Stück", unitPrice: 3200, vatRate: 19 },
  ],
};

export interface AdvanceInvoice {
  number: string;
  date: string;
  orderNumber: string;
  description: string;
  net: number;
  vatRate: number;
  vat: number;
  gross: number;
}

export const ADVANCE_INVOICES: AdvanceInvoice[] = [
  {
    number: "AR-2026-0007",
    date: "2026-06-15",
    orderNumber: "AB-2026-0142",
    description: "Abschlagsrechnung 1 (30 % bei Auftragsbeginn)",
    net: 15000,
    vatRate: 19,
    vat: 2850,
    gross: 17850,
  },
];

export interface Payment {
  id: string;
  date: string;
  amount: number;
  invoiceNumber: string;
  reference: string;
}

export const PAYMENTS: Payment[] = [
  { id: "ZE-2026-0311", date: "2026-06-29", amount: 17850, invoiceNumber: "AR-2026-0007", reference: "BeispielMed GmbH AR-2026-0007" },
];

export const FINAL_INVOICE_NUMBER = "SR-2026-0019";
