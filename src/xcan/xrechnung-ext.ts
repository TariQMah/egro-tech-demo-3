/**
 * Thin extension of XCAN's XRechnung generator. XCAN builds the full EN 16931 / XRechnung 3.0 CII
 * document; this module adds the fields the Ergo-Tec scenarios need and XCAN does not write yet:
 *
 *  - BT-13  purchase order reference         (ram:BuyerOrderReferencedDocument)
 *  - BT-12  contract reference               (ram:ContractReferencedDocument)
 *  - BT-155 seller's article number per line (ram:SellerAssignedID)
 *  - BT-132 referenced purchase order line   (line ram:BuyerOrderReferencedDocument/ram:LineID)
 *  - BT-3   document type override           (e.g. 384 corrected invoice without XCAN's storno logic)
 *
 * Everything else, including totals, VAT breakdown and the preceding-invoice reference (BT-25),
 * comes unchanged from XCAN. XCAN's ZUGFeRD generator is pointed at this module by the build, so the
 * XML embedded in the PDF is identical to the standalone file.
 */
import * as base from "@xcan/xrechnung-generator";
import type { XRechnungInvoiceData } from "@xcan/xrechnung-generator";

export * from "@xcan/xrechnung-generator";

export interface ExtLineFields {
  sellerItemId?: string;
  orderLineId?: string;
}

export interface ExtInvoiceFields {
  orderReference?: string;
  contractReference?: string;
  typeCodeOverride?: "380" | "381" | "384";
}

export type ExtInvoiceData = XRechnungInvoiceData &
  ExtInvoiceFields & { items: Array<XRechnungInvoiceData["items"][number] & ExtLineFields> };

const esc = base.escapeXml;

export function generateXRechnungXml(data: XRechnungInvoiceData | ExtInvoiceData): string {
  const ext = data as ExtInvoiceData;
  let xml = base.generateXRechnungXml(data);

  // Line level: article number and referenced PO line, in CII element order.
  let index = 0;
  xml = xml.replace(/<ram:IncludedSupplyChainTradeLineItem>[\s\S]*?<\/ram:IncludedSupplyChainTradeLineItem>/g, (chunk) => {
    const item = ext.items[index++];
    if (!item) return chunk;
    let out = chunk;
    if (item.sellerItemId) {
      out = out.replace(
        /<ram:SpecifiedTradeProduct>\s*<ram:Name>/,
        `<ram:SpecifiedTradeProduct>\n        <ram:SellerAssignedID>${esc(item.sellerItemId)}</ram:SellerAssignedID>\n        <ram:Name>`
      );
    }
    if (item.orderLineId) {
      out = out.replace(
        "<ram:SpecifiedLineTradeAgreement>",
        `<ram:SpecifiedLineTradeAgreement>\n        <ram:BuyerOrderReferencedDocument>\n          <ram:LineID>${esc(item.orderLineId)}</ram:LineID>\n        </ram:BuyerOrderReferencedDocument>`
      );
    }
    return out;
  });

  // Header level: BT-13 and BT-12 close the trade agreement (after the parties).
  const refs = [
    ext.orderReference
      ? `      <ram:BuyerOrderReferencedDocument>\n        <ram:IssuerAssignedID>${esc(ext.orderReference)}</ram:IssuerAssignedID>\n      </ram:BuyerOrderReferencedDocument>`
      : "",
    ext.contractReference
      ? `      <ram:ContractReferencedDocument>\n        <ram:IssuerAssignedID>${esc(ext.contractReference)}</ram:IssuerAssignedID>\n      </ram:ContractReferencedDocument>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (refs) xml = xml.replace("</ram:ApplicableHeaderTradeAgreement>", `${refs}\n    </ram:ApplicableHeaderTradeAgreement>`);

  if (ext.typeCodeOverride) {
    xml = xml.replace(/(<rsm:ExchangedDocument>[\s\S]*?<ram:TypeCode>)\d+(<\/ram:TypeCode>)/, `$1${ext.typeCodeOverride}$2`);
  }
  return xml;
}
