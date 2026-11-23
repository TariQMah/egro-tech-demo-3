import { useEffect, useMemo, useState, type Dispatch } from "react";
import { generateXRechnungXml, generateZugferdPdf, base64ToBytes, bytesToBase64 } from "../xcan";
import { buildFinalInvoice, calculateFinal } from "../domain/final-invoice";
import { validateFinalInvoice, type FinalCheck } from "../domain/validate-final";
import { ADVANCE_INVOICES, CUSTOMER, CUSTOMER_ORDER, ERGO_TEC, FINAL_INVOICE_NUMBER } from "../domain/data";
import { ACTORS, type Action, type OutgoingState } from "./store";
import { L, tx, txt, getLang } from "../i18n";
import { Badge, Button, Card, Field, Tabs } from "./components";
import { addDays, dateDe, download, eur, num, timeDe } from "./format";

const deEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const deEurF = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const deNum = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const deDate = (iso: string) => iso.split("-").reverse().join(".");
const enEur = (n: number) => "€" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OutgoingView({ state, dispatch }: { state: OutgoingState; dispatch: Dispatch<Action> }) {
  const order = CUSTOMER_ORDER;
  const calc = useMemo(() => calculateFinal(order), [order]);
  const dueDate = addDays(state.issueDate, state.paymentDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = state.generated;
  const outdated = !!gen && (gen.issueDate !== state.issueDate || gen.dueDate !== dueDate);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = buildFinalInvoice({ invoiceNumber: FINAL_INVOICE_NUMBER, issueDate: state.issueDate, dueDate }, order);
      const xml = generateXRechnungXml(data);
      const pdf = await generateZugferdPdf(data);
      const validation = await validateFinalInvoice(xml, calc, ADVANCE_INVOICES.map((a) => a.number), pdf);
      const failed = validation.checks.filter((c) => !c.ok).length;
      dispatch({
        type: "outgoing",
        patch: { generated: { createdAt: new Date().toISOString(), issueDate: state.issueDate, dueDate, xml, pdfBase64: bytesToBase64(pdf), validation } },
        log: [
          {
            actor: ACTORS.debitoren,
            text: txt(
              `Schlussrechnung ${FINAL_INVOICE_NUMBER} erzeugt: ${deEur(calc.remaining.gross)} (netto ${deEur(calc.remaining.net)}, USt ${deEur(calc.remaining.vat)}).`,
              `Final invoice ${FINAL_INVOICE_NUMBER} generated: ${enEur(calc.remaining.gross)} (net ${enEur(calc.remaining.net)}, VAT ${enEur(calc.remaining.vat)}).`
            ),
          },
          {
            actor: ACTORS.system,
            text: failed
              ? txt(`Validierung: ${failed} Prüfung(en) nicht bestanden.`, `Validation: ${failed} check(s) failed.`)
              : txt(
                  `Validierung bestanden (${validation.checks.length} Prüfungen inkl. Rückimport von XML und PDF).`,
                  `Validation passed (${validation.checks.length} checks incl. re-import of XML and PDF).`
                ),
          },
        ],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view">
      <div className="story">
        <strong>{L("Szenario:", "Scenario:")}</strong>{" "}
        {L(
          `Ergo-Tec schließt das Kundenprojekt „${order.title}“ ab. Auftragswert ${eur(calc.total.net)} netto, Abschlag ${eur(calc.deducted.net)} netto bereits berechnet und bezahlt. Die Schlussrechnung entsteht aus den vorhandenen Daten – ohne erneute Eingabe.`,
          `Ergo-Tec completes the customer project "${order.title}". Contract value ${eur(calc.total.net)} net; an advance of ${eur(calc.deducted.net)} net has already been invoiced and paid. The final invoice is built from the existing data – nothing is typed in again.`
        )}
      </div>

      <Card step="1" title={L("Kunde und Auftrag", "Customer and order")} right={<span className="muted small">{L("aus vorbereiteten Auftragsdaten", "from prepared order data")}</span>}>
        <div className="grid-3">
          <dl className="fields">
            <Field label={L("Kunde", "Customer")}>
              {CUSTOMER.name} <span className="muted">({CUSTOMER.customerNumber})</span>
            </Field>
            <Field label={L("Anschrift", "Address")}>
              {CUSTOMER.street}, {CUSTOMER.zipCity}
            </Field>
            <Field label={L("USt-IdNr.", "VAT ID")} mono>
              {CUSTOMER.vatId}
            </Field>
            <Field label={L("Rechnungsempfang", "Invoice e-mail")}>{CUSTOMER.email}</Field>
          </dl>
          <dl className="fields">
            <Field label={L("Auftrag", "Order")} mono>
              {order.number}
            </Field>
            <Field label={L("Bestellnummer Kunde", "Customer PO")} mono>
              {order.customerPo}
            </Field>
            <Field label={L("Vertrag", "Contract")} mono>
              {order.contract}
            </Field>
            <Field label={L("Leistungszeitraum", "Service period")}>
              {dateDe(order.servicePeriod.from)} – {dateDe(order.servicePeriod.to)}
            </Field>
          </dl>
          <dl className="fields">
            <Field label={L("Rechnungssteller", "Seller")}>{ERGO_TEC.name}</Field>
            <Field label={L("USt-IdNr.", "VAT ID")} mono>
              {ERGO_TEC.vatId}
            </Field>
            <Field label={L("Bank", "Bank")}>{ERGO_TEC.iban}</Field>
          </dl>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{L("Leistung", "Service")}</th>
              <th className="r">{L("Menge", "Qty")}</th>
              <th className="r">{L("Einzelpreis", "Unit price")}</th>
              <th className="r">{L("USt", "VAT")}</th>
              <th className="r">{L("Netto", "Net")}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.description}>
                <td>{l.description}</td>
                <td className="r">
                  {num(l.quantity)} {l.unit}
                </td>
                <td className="r">{eur(l.unitPrice)}</td>
                <td className="r">{l.vatRate} %</td>
                <td className="r">{eur(l.quantity * l.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>{L("Auftragswert", "Contract value")}</td>
              <td className="r">
                <strong>{eur(calc.total.net)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card step="2" title={L("Abschlagsrechnungen und Zahlungseingänge", "Advance invoices and payments received")}>
        <table className="table">
          <thead>
            <tr>
              <th>{L("Abschlagsrechnung", "Advance invoice")}</th>
              <th>{L("Datum", "Date")}</th>
              <th className="r">{L("Netto", "Net")}</th>
              <th className="r">{L("USt", "VAT")}</th>
              <th className="r">{L("Brutto", "Gross")}</th>
              <th>{L("Zahlung", "Payment")}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calc.deductions.map((d) => (
              <tr key={d.advance.number}>
                <td>
                  <span className="mono">{d.advance.number}</span>
                  <div className="muted small">{d.advance.description}</div>
                </td>
                <td>{dateDe(d.advance.date)}</td>
                <td className="r">{eur(d.advance.net)}</td>
                <td className="r">{eur(d.advance.vat)}</td>
                <td className="r">{eur(d.advance.gross)}</td>
                <td>
                  {d.payments.map((p) => (
                    <div key={p.id}>
                      <span className="mono">{p.id}</span> · {dateDe(p.date)} · {eur(p.amount)}
                    </div>
                  ))}
                </td>
                <td>{d.fullyPaid ? <Badge tone="ok">{L("bezahlt", "paid")}</Badge> : <Badge tone="warn">{L("offen", "open")}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card step="3" title={L("Berechnung der Schlussrechnung", "Final invoice calculation")} right={<span className="muted small">§ 14 Abs. 5 Satz 2 UStG</span>}>
        <table className="table calc">
          <thead>
            <tr>
              <th />
              <th className="r">{L("Netto", "Net")}</th>
              <th className="r">
                {L("USt", "VAT")} {calc.vatRate} %
              </th>
              <th className="r">{L("Brutto", "Gross")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{L(`Gesamtleistung laut Auftrag ${order.number}`, `Total per order ${order.number}`)}</td>
              <td className="r">{eur(calc.total.net)}</td>
              <td className="r">{eur(calc.total.vat)}</td>
              <td className="r">{eur(calc.total.gross)}</td>
            </tr>
            {calc.deductions.map((d) => (
              <tr key={d.advance.number} className="minus">
                <td>{L(`abzgl. ${d.advance.number} vom ${dateDe(d.advance.date)} (bezahlt)`, `less ${d.advance.number} of ${dateDe(d.advance.date)} (paid)`)}</td>
                <td className="r">−{eur(d.advance.net)}</td>
                <td className="r">−{eur(d.advance.vat)}</td>
                <td className="r">−{eur(d.advance.gross)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{L("Restbetrag (zahlbar)", "Remaining amount (payable)")}</td>
              <td className="r">{eur(calc.remaining.net)}</td>
              <td className="r">{eur(calc.remaining.vat)}</td>
              <td className="r">
                <strong>{eur(calc.remaining.gross)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="muted small">
          {L(
            `In der E-Rechnung wird der Abschlag als Position mit Menge −1 und positivem Preis abgezogen (BR-27) und über BT-25 auf ${calc.deductions.map((d) => d.advance.number).join(", ")} verwiesen. Ausgewiesene USt der Rechnung = noch geschuldete USt (${eur(calc.remaining.vat)}).`,
            `In the e-invoice the advance is deducted as a line with quantity −1 and a positive price (BR-27), and BT-25 refers to ${calc.deductions.map((d) => d.advance.number).join(", ")}. The VAT stated on the invoice is the VAT still owed (${eur(calc.remaining.vat)}).`
          )}
        </p>
      </Card>

      <Card step="4" title={L("Schlussrechnung erzeugen", "Generate final invoice")}>
        <div className="form-row">
          <label>
            {L("Rechnungsnummer", "Invoice number")}
            <input value={FINAL_INVOICE_NUMBER} readOnly className="mono" />
          </label>
          <label>
            {L("Rechnungsdatum", "Invoice date")}
            <input type="date" value={state.issueDate} onChange={(e) => e.target.value && dispatch({ type: "outgoing", patch: { issueDate: e.target.value } })} />
          </label>
          <label>
            {L("Zahlungsziel", "Payment terms")}
            <select value={state.paymentDays} onChange={(e) => dispatch({ type: "outgoing", patch: { paymentDays: Number(e.target.value) } })}>
              {[14, 30, 45].map((d) => (
                <option key={d} value={d}>
                  {L(`${d} Tage (bis ${dateDe(addDays(state.issueDate, d))})`, `${d} days (until ${dateDe(addDays(state.issueDate, d))})`)}
                </option>
              ))}
            </select>
          </label>
          <Button kind="primary" onClick={generate} disabled={busy}>
            {gen ? L("Neu erzeugen", "Regenerate") : L("Schlussrechnung erzeugen", "Generate final invoice")}
          </Button>
        </div>
        {busy && <p className="muted">{L("XRechnung und ZUGFeRD-PDF werden mit der XCAN-Engine erzeugt …", "Generating XRechnung and ZUGFeRD PDF with the XCAN engine …")}</p>}
        {error && (
          <div className="alert alert-err">
            {L("Fehler:", "Error:")} {error}
          </div>
        )}
        {outdated && <div className="alert alert-warn">{L("Datum oder Zahlungsziel wurde geändert – bitte neu erzeugen.", "Date or payment terms changed – please regenerate.")}</div>}
      </Card>

      {gen && <Validation checks={gen.validation.checks} ok={gen.validation.ok} createdAt={gen.createdAt} />}
      {gen && <Preview xml={gen.xml} pdfBase64={gen.pdfBase64} issueDate={gen.issueDate} dueDate={gen.dueDate} />}
    </div>
  );
}

function Validation({ checks, ok, createdAt }: { checks: FinalCheck[]; ok: boolean; createdAt: string }) {
  const groups: Array<{ source: FinalCheck["source"]; title: string }> = [
    { source: "XCAN", title: L("XCAN EN-16931-Prüfung", "XCAN EN 16931 check") },
    { source: "Schlussrechnung", title: L("Rechenregeln und Bezüge der Schlussrechnung", "Final invoice arithmetic and references") },
    { source: "Rückimport", title: L("Rückimport mit XCAN", "Re-import with XCAN") },
  ];
  return (
    <Card
      step="5"
      title={L("Validierung", "Validation")}
      tone={ok ? "ok" : "warn"}
      right={
        ok ? (
          <Badge tone="ok">{L(`gültig · ${checks.length} Prüfungen`, `valid · ${checks.length} checks`)}</Badge>
        ) : (
          <Badge tone="err">{L(`${checks.filter((c) => !c.ok).length} Fehler`, `${checks.filter((c) => !c.ok).length} errors`)}</Badge>
        )
      }
    >
      <p className="muted small">
        {L("Geprüft", "Checked")} {timeDe(createdAt)}.
      </p>
      <div className="grid-3">
        {groups.map((g) => (
          <div key={g.source}>
            <h4>{g.title}</h4>
            <ul className="checks">
              {checks
                .filter((c) => c.source === g.source)
                .map((c) => (
                  <li key={c.id} className={c.ok ? (c.warning ? "check-warn" : "check-pass") : "check-fail"}>
                    <span className="check-icon">{c.ok ? (c.warning ? "!" : "✓") : "✕"}</span>
                    <span className="mono">{c.id}</span> {tx(c.label)}
                    {c.details && <div className="muted small">{tx(c.details)}</div>}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted small">
        {L("Zusätzlich prüfbar: XML herunterladen und im öffentlichen", "Also checkable: download the XML and upload it to the public")}{" "}
        <a href="https://xcan.eu/validator" target="_blank" rel="noreferrer">
          XCAN Validator
        </a>
        {L(" hochladen.", ".")}
      </p>
    </Card>
  );
}

function Preview({ xml, pdfBase64, issueDate, dueDate }: { xml: string; pdfBase64: string; issueDate: string; dueDate: string }) {
  const [tab, setTab] = useState<"ansicht" | "pdf" | "xml">("ansicht");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([base64ToBytes(pdfBase64)], { type: "application/pdf" }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBase64]);
  const calc = calculateFinal();
  const data = buildFinalInvoice({ invoiceNumber: FINAL_INVOICE_NUMBER, issueDate, dueDate });

  return (
    <Card
      step="6"
      title={L("Vorschau und Download", "Preview and download")}
      right={
        <div className="row">
          <Button kind="primary" onClick={() => download(`${FINAL_INVOICE_NUMBER}_xrechnung.xml`, xml, "application/xml")}>
            XRechnung (XML)
          </Button>
          <Button kind="primary" onClick={() => download(`${FINAL_INVOICE_NUMBER}_zugferd.pdf`, base64ToBytes(pdfBase64), "application/pdf")}>
            ZUGFeRD (PDF/A-3)
          </Button>
        </div>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "ansicht", label: L("Rechnungsansicht", "Invoice view") },
          { id: "pdf", label: L("ZUGFeRD-PDF", "ZUGFeRD PDF") },
          { id: "xml", label: "XML" },
        ]}
      />
      {tab === "ansicht" && getLang() === "en" && <p className="muted small">Preview of the invoice document (German, as sent to the customer).</p>}
      {tab === "ansicht" && (
        <div className="paper" lang="de">
          <div className="paper-head">
            <div>
              <div className="sender-line">
                {ERGO_TEC.name} · {ERGO_TEC.street} · {ERGO_TEC.zipCity}
              </div>
              <div>{CUSTOMER.name}</div>
              <div>{CUSTOMER.contactPerson}</div>
              <div>{CUSTOMER.street}</div>
              <div>{CUSTOMER.zipCity}</div>
            </div>
            <dl className="paper-meta">
              <Field label="Rechnungsnr.">{FINAL_INVOICE_NUMBER}</Field>
              <Field label="Datum">{deDate(issueDate)}</Field>
              <Field label="Kundennr.">{CUSTOMER.customerNumber}</Field>
              <Field label="Ihre Bestellung">{CUSTOMER_ORDER.customerPo}</Field>
              <Field label="Auftrag">{CUSTOMER_ORDER.number}</Field>
            </dl>
          </div>
          <h3>Schlussrechnung {FINAL_INVOICE_NUMBER}</h3>
          <p>
            {CUSTOMER_ORDER.title}, Leistungszeitraum {deDate(CUSTOMER_ORDER.servicePeriod.from)} – {deDate(CUSTOMER_ORDER.servicePeriod.to)}.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Bezeichnung</th>
                <th className="r">Menge</th>
                <th className="r">Einzelpreis</th>
                <th className="r">USt</th>
                <th className="r">Betrag netto</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.position} className={it.quantity < 0 ? "minus" : ""}>
                  <td>{it.position}</td>
                  <td>{it.description}</td>
                  <td className="r">{deNum(it.quantity)}</td>
                  <td className="r">{deEurF(it.unitPrice)}</td>
                  <td className="r">{it.vatRate} %</td>
                  <td className="r">{deEurF(it.netTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="table calc compact">
            <tbody>
              <tr>
                <td>Gesamtleistung</td>
                <td className="r">{deEurF(calc.total.net)}</td>
                <td className="r">USt {deEurF(calc.total.vat)}</td>
                <td className="r">{deEurF(calc.total.gross)}</td>
              </tr>
              {calc.deductions.map((d) => (
                <tr key={d.advance.number} className="minus">
                  <td>abzgl. Abschlag {d.advance.number}</td>
                  <td className="r">−{deEurF(d.advance.net)}</td>
                  <td className="r">USt −{deEurF(d.advance.vat)}</td>
                  <td className="r">−{deEurF(d.advance.gross)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Zu zahlen</td>
                <td className="r">{deEurF(calc.remaining.net)}</td>
                <td className="r">USt {deEurF(calc.remaining.vat)}</td>
                <td className="r">
                  <strong>{deEurF(calc.remaining.gross)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
          <p>
            Zahlbar bis {deDate(dueDate)} ohne Abzug auf {ERGO_TEC.iban} ({ERGO_TEC.bic}).
          </p>
          <p className="muted small">
            {ERGO_TEC.name} · USt-IdNr. {ERGO_TEC.vatId} · St.-Nr. {ERGO_TEC.taxNumber}
          </p>
        </div>
      )}
      {tab === "pdf" && (pdfUrl ? <iframe className="pdf" src={pdfUrl} title="ZUGFeRD-PDF" /> : <p className="muted">PDF wird geladen …</p>)}
      {tab === "xml" && <pre className="code">{xml}</pre>}
    </Card>
  );
}
