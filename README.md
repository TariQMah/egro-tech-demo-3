# Ergo-Tec – E-Rechnung Demo (prototype)

Clickable MVP for the third Ergo-Tec demo. The UI is German by default; a DE | EN switch in the header changes the UI language. Invoice documents (XML, PDF, preview, supplier letter) stay German. It shows two connected workflows:

1. **Eingangsrechnung:** import an XRechnung or ZUGFeRD invoice, three-way match it against the purchase order and goods receipts, detect the quantity discrepancy (10 invoiced, 8 delivered), block payment, resolve it, match again, then approve.
2. **Schlussrechnung:** take customer, order, advance invoice and payment from the prepared data, calculate 50.000 − 15.000 = 35.000 € net (+ 6.650 € VAT), generate the XRechnung XML and the ZUGFeRD PDF, validate them, then preview and download.

No server: the build is a single `dist/index.html` that runs entirely in the browser and also opens from `file://`.

## Run

```bash
npm install
npm run build          # → dist/index.html (single file, double-click to open)
npm run dev            # dev server with hot reload
npm test               # Vitest: matching, final invoice, XCAN round trip
npm run e2e            # clicks through both scenarios in Chrome (needs a build)
npm run samples        # regenerate the supplier sample e-invoices in data/samples/
npm run pages          # build and copy to docs/index.html for GitHub Pages
```

## Deploy to GitHub Pages

The build needs the XCAN source next to this folder, so it is built locally and the finished single file is committed:

1. `npm run pages` writes `docs/index.html`.
2. Commit and push to `main`.
3. In the GitHub repository: Settings → Pages → Source "Deploy from a branch", branch `main`, folder `/docs`.

Repeat steps 1–2 after every change; Pages updates in about a minute.

Note: the built file contains XCAN's library code (minified). A public repository or a Pages site on a public repository publishes it.

The XCAN source must sit next to this folder (`../devoreo-erechnung`), or set `XCAN_ROOT`.

## How it connects to XCAN

XCAN's code is used as-is, bundled at build time. Nothing in `devoreo-erechnung` was changed.

| Used from XCAN (`../devoreo-erechnung/src/lib`) | Purpose |
|---|---|
| `incoming/invoice-extractor.ts` | Read XRechnung (CII/UBL) and ZUGFeRD PDF (embedded XML) |
| `validator/en16931-validator.ts` | EN 16931 rule check (same engine as app.xcan.eu) |
| `xrechnung-generator.ts` | XRechnung 3.0 CII generation, VAT breakdown, BT-25 reference |
| `zugferd-generator.ts` + `assets/pdf` fonts | ZUGFeRD 2.3 PDF/A-3 |
| `calculations.ts` | Line, VAT and rounding calculation |

Added in this demo:

- `src/xcan/xrechnung-ext.ts` adds BT-13 (PO number), BT-12 (contract), BT-155 (article number), BT-132 (PO line) and a document type override to XCAN's XML. A Vite plugin (`xcan.config.ts`) also points XCAN's ZUGFeRD generator at this module, so the XML embedded in the PDF carries the same fields.
- `src/xcan/extract-ext.ts` reads BT-3/13/25/132/155 from the XML that XCAN's extractor returns.
- `src/shims/*` contains small browser versions of `fs`, `path`, `zlib` and `crypto` for XCAN's Node code.
- `src/domain/matching.ts` is the three-way matching (quantity against goods receipt and order, price with 0.5 % tolerance, VAT rate, PO number, supplier).
- `src/domain/final-invoice.ts` + `validate-final.ts` calculate the Schlussrechnung (§ 14 Abs. 5 UStG) and run the extra checks: BR-27, BR-CO-10/14/16, BR-S-08, BT-25, BT-13, deduction arithmetic, advance paid, plus an XML and PDF round trip through XCAN's extractor.

The advance is deducted as a line with quantity −1 and a positive price, because BR-27 forbids negative prices. The XML therefore states the VAT still owed (6.650 €). The advance's net amount and VAT also appear in the note.

## Real vs. simulated

- **Real:** file import, extraction, EN 16931 check, matching, discrepancy detection, XRechnung/ZUGFeRD generation, validation, downloads. The generated files were also checked with the live validator at app.xcan.eu: compliant, 0 errors.
- **Simulated:** purchase order, goods receipts, customer order, advance invoice and payments (`src/domain/data.ts`). The clarification e-mail is drafted, not sent, and persons are fixed names, not logins. All companies except the name Ergo-Tec are fictional; tax IDs and IBANs are sample values.
- **Limits:** XCAN's validator checks the core EN 16931 rules, not the full KoSIT schematron. XCAN's PDF title is always "Rechnung …" and it shortens item texts longer than 40 characters.

State is kept in `localStorage`; "Demo zurücksetzen" clears it.
