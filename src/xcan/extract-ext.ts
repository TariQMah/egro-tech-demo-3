/**
 * Import = XCAN's extractor (XRechnung CII/UBL, ZUGFeRD PDF with embedded XML) + XCAN's EN 16931 check,
 * plus the references needed for three-way matching that XCAN does not extract yet (BT-3, BT-13,
 * BT-25, BT-132, BT-155). Those are read from the same raw XML that XCAN returns.
 */
import { Buffer } from "buffer";
import { extractIncomingInvoice, type ExtractedInvoiceData, type ExtractedLineItem } from "@xcan/incoming/invoice-extractor";
import { validateEn16931Xml, type ValidationReport } from "@xcan/validator/en16931-validator";

export interface ImportedLine extends ExtractedLineItem {
  sellerItemId?: string;
  orderLineId?: string;
}

export interface ImportedInvoice extends Omit<ExtractedInvoiceData, "items"> {
  fileName: string;
  typeCode: string;
  orderReference?: string;
  precedingInvoiceNumber?: string;
  items: ImportedLine[];
  /** XCAN's EN 16931 report with English rule texts (validationReport is German). */
  validationReportEn: ValidationReport;
}

const first = (s: string, re: RegExp) => s.match(re)?.[1]?.trim() || undefined;

export function readReferences(xml: string) {
  const isCii = xml.includes("CrossIndustryInvoice");
  if (isCii) {
    const header = xml.match(/<ram:ApplicableHeaderTradeAgreement>[\s\S]*?<\/ram:ApplicableHeaderTradeAgreement>/)?.[0] || "";
    const lines = xml.match(/<ram:IncludedSupplyChainTradeLineItem>[\s\S]*?<\/ram:IncludedSupplyChainTradeLineItem>/g) || [];
    return {
      typeCode: first(xml, /<rsm:ExchangedDocument>[\s\S]*?<ram:TypeCode>(\d+)<\/ram:TypeCode>/) || "380",
      orderReference: first(header, /<ram:BuyerOrderReferencedDocument>\s*<ram:IssuerAssignedID>([^<]+)</),
      precedingInvoiceNumber: first(xml, /<ram:InvoiceReferencedDocument>\s*<ram:IssuerAssignedID>([^<]+)</),
      lines: lines.map((l) => ({
        sellerItemId: first(l, /<ram:SellerAssignedID>([^<]+)</),
        orderLineId: first(l, /<ram:BuyerOrderReferencedDocument>\s*<ram:LineID>([^<]+)</),
      })),
    };
  }
  const lines = xml.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g) || [];
  return {
    typeCode: first(xml, /<cbc:InvoiceTypeCode>(\d+)</) || "380",
    orderReference: first(xml, /<cac:OrderReference>\s*<cbc:ID>([^<]+)</),
    precedingInvoiceNumber: first(xml, /<cac:BillingReference>[\s\S]*?<cbc:ID>([^<]+)</),
    lines: lines.map((l) => ({
      sellerItemId: first(l, /<cac:SellersItemIdentification>\s*<cbc:ID>([^<]+)</),
      orderLineId: first(l, /<cac:OrderLineReference>\s*<cbc:LineID>([^<]+)</),
    })),
  };
}

export async function importInvoice(bytes: Uint8Array, fileName: string): Promise<ImportedInvoice> {
  const extracted = await extractIncomingInvoice(Buffer.from(bytes), fileName, "de");
  const refs = readReferences(extracted.rawXml);
  return {
    ...extracted,
    fileName,
    typeCode: refs.typeCode,
    orderReference: refs.orderReference,
    precedingInvoiceNumber: refs.precedingInvoiceNumber,
    items: extracted.items.map((it, i) => ({ ...it, ...refs.lines[i] })),
    validationReportEn: validateEn16931Xml(extracted.rawXml, "en"),
  };
}
