import { useRef, useState, type Dispatch } from "react";
import { importInvoice, base64ToBytes, type ImportedInvoice } from "../xcan";
import { threeWayMatch, type LineMatch, type MatchResult } from "../domain/matching";
import { FOLLOW_UP_RECEIPT, GOODS_RECEIPTS, PURCHASE_ORDER, type GoodsReceipt } from "../domain/data";
import { SAMPLE_FILES } from "../domain/samples";
import { L, tx, txt, getLang, type Txt } from "../i18n";
import { ACTORS, type Action, type IncomingState } from "./store";
import { Badge, Button, Card, Collapsible, Field } from "./components";
import { dateDe, download, eur, num, timeDe, TYPE_CODES } from "./format";
import invoiceXml from "../../data/samples/RE-MH-2026-0418_xrechnung.xml?raw";
import correctionXml from "../../data/samples/RE-MH-2026-0418-K1_xrechnung.xml?raw";
import invoicePdf from "../../data/samples/RE-MH-2026-0418_zugferd.pdf?base64";

const enc = (s: string) => new TextEncoder().encode(s);
const eurDe = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurEn = (n: number) => "€" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const typeLabel = (code: string) => (TYPE_CODES[code] ? tx(TYPE_CODES[code]) : code);

const STATUS: Record<IncomingState["status"], { tone: "ok" | "warn" | "err" | "info" | "muted"; label: Txt }> = {
  LEER: { tone: "muted", label: txt("Keine Rechnung", "No invoice") },
  KLAERUNG: { tone: "err", label: txt("Klärung erforderlich – Zahlung gesperrt", "Clarification required – payment blocked") },
  IN_KLAERUNG: { tone: "warn", label: txt("In Klärung – Zahlung gesperrt", "In clarification – payment blocked") },
  ABGEGLICHEN: { tone: "ok", label: txt("Abgeglichen – bereit zur Zahlungsfreigabe", "Matched – ready for payment approval") },
  FREIGEGEBEN: { tone: "ok", label: txt("Zur Zahlung freigegeben", "Approved for payment") },
};

export function receiptsOf(s: IncomingState): GoodsReceipt[] {
  return [...GOODS_RECEIPTS, ...s.extraReceipts];
}

export function IncomingView({ state, dispatch }: { state: IncomingState; dispatch: Dispatch<Action> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const inv = state.invoice;
  const match = state.match;

  async function handleImport(bytes: Uint8Array, name: string, origin: Txt) {
    setError(null);
    setBusy(true);
    try {
      const imported = await importInvoice(bytes, name);
      const isCorrection = !!(inv && imported.precedingInvoiceNumber === inv.invoiceNumber && imported.typeCode === "384");
      // A correction continues the current case; any other import starts a new one with the base receipts.
      const extraReceipts = isCorrection ? state.extraReceipts : [];
      const result = threeWayMatch(imported, PURCHASE_ORDER, [...GOODS_RECEIPTS, ...extraReceipts]);
      const r = imported.validationReport;
      const type = TYPE_CODES[imported.typeCode] ?? txt(imported.typeCode, imported.typeCode);
      const logs = [
        {
          actor: ACTORS.system,
          text: txt(
            `${origin.de}: ${imported.fileName} importiert (${imported.format}, ${type.de}). EN 16931: ${r.isCompliant ? "konform" : `${r.failedChecks} Fehler`}.`,
            `${origin.en}: ${imported.fileName} imported (${imported.format}, ${type.en}). EN 16931: ${r.isCompliant ? "compliant" : `${r.failedChecks} errors`}.`
          ),
        },
        ...(isCorrection
          ? [
              {
                actor: ACTORS.einkauf,
                text: txt(`Rechnung ${inv!.invoiceNumber} durch Korrektur ${imported.invoiceNumber} ersetzt.`, `Invoice ${inv!.invoiceNumber} replaced by correction ${imported.invoiceNumber}.`),
              },
            ]
          : []),
        { actor: ACTORS.system, text: matchLogText(result) },
      ];
      dispatch({
        type: "incoming",
        patch: {
          invoice: imported,
          replaced: isCorrection ? [...state.replaced, inv!] : [],
          extraReceipts,
          match: result,
          matchStale: false,
          status: result.ok ? "ABGEGLICHEN" : "KLAERUNG",
          clarification: isCorrection ? state.clarification : null,
          exception: null,
          approval: null,
        },
        log: logs,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    await handleImport(new Uint8Array(await f.arrayBuffer()), f.name, txt("Upload", "Upload"));
    if (fileRef.current) fileRef.current.value = "";
  }

  function rematch() {
    if (!inv) return;
    const result = threeWayMatch(inv, PURCHASE_ORDER, receiptsOf(state));
    const t = matchLogText(result);
    dispatch({
      type: "incoming",
      patch: { match: result, matchStale: false, status: result.ok || state.exception ? "ABGEGLICHEN" : state.clarification ? "IN_KLAERUNG" : "KLAERUNG" },
      log: { actor: ACTORS.einkauf, text: txt(`Abgleich wiederholt. ${t.de}`, `Matching repeated. ${t.en}`) },
    });
  }

  function openClarification() {
    if (!inv || !match) return;
    const request = clarificationText(inv, match);
    dispatch({
      type: "incoming",
      patch: { status: "IN_KLAERUNG", clarification: { assignee: ACTORS.einkauf, at: new Date().toISOString(), request } },
      log: {
        actor: ACTORS.kreditoren,
        text: txt(
          `Klärung an ${ACTORS.einkauf.de} übergeben; Klärungsanfrage an ${inv.senderName} vorbereitet (nicht versendet, Demo).`,
          `Clarification handed to ${ACTORS.einkauf.en}; request to ${inv.senderName} drafted (not sent, demo).`
        ),
      },
    });
  }

  function bookFollowUp() {
    const l = FOLLOW_UP_RECEIPT.lines[0];
    dispatch({
      type: "incoming",
      patch: { extraReceipts: [...state.extraReceipts, FOLLOW_UP_RECEIPT], matchStale: true },
      log: {
        actor: ACTORS.wareneingang,
        text: txt(
          `Nachlieferung gebucht: ${FOLLOW_UP_RECEIPT.number}, ${l.quantity} × ${l.articleNo} (Lieferschein ${FOLLOW_UP_RECEIPT.deliveryNote}).`,
          `Follow-up delivery booked: ${FOLLOW_UP_RECEIPT.number}, ${l.quantity} × ${l.articleNo} (delivery note ${FOLLOW_UP_RECEIPT.deliveryNote}).`
        ),
      },
    });
  }

  function acceptException() {
    const r = reason.trim();
    dispatch({
      type: "incoming",
      patch: { exception: { reason: r, by: ACTORS.einkauf, at: new Date().toISOString() }, status: "ABGEGLICHEN" },
      log: { actor: ACTORS.einkauf, text: txt(`Abweichung mit Begründung akzeptiert: „${r}“`, `Discrepancy accepted with reason: "${r}"`) },
    });
    setReason("");
  }

  function approve() {
    if (!inv) return;
    const ex = !!state.exception;
    dispatch({
      type: "incoming",
      patch: { status: "FREIGEGEBEN", approval: { by: ACTORS.kreditoren, at: new Date().toISOString(), amount: inv.grossTotal, withException: ex } },
      log: {
        actor: ACTORS.kreditoren,
        text: txt(
          `Rechnung ${inv.invoiceNumber} über ${eurDe(inv.grossTotal)} zur Zahlung freigegeben${ex ? " (mit dokumentierter Ausnahme)" : ""}.`,
          `Invoice ${inv.invoiceNumber} for ${eurEn(inv.grossTotal)} approved for payment${ex ? " (with documented exception)" : ""}.`
        ),
      },
    });
  }

  const canApprove = state.status === "ABGEGLICHEN" && !state.matchStale;
  const approveReason = !inv
    ? L("Erst eine Rechnung importieren", "Import an invoice first")
    : state.status === "FREIGEGEBEN"
    ? L("Bereits freigegeben", "Already approved")
    : state.matchStale
    ? L("Abgleich nach der Klärung wiederholen", "Repeat the matching after the clarification")
    : state.status !== "ABGEGLICHEN"
    ? L("Abgleich zeigt Abweichungen – erst klären", "Matching shows discrepancies – clarify first")
    : undefined;
  const sample = txt("Postfach (Muster)", "Inbox (sample)");

  return (
    <div className="view">
      <div className="story">
        <strong>{L("Szenario:", "Scenario:")}</strong>{" "}
        {L(
          "Ergo-Tec bestellt 10 elektrische Hubantriebe für die Fertigung von Untersuchungsliegen. Der Lieferant berechnet 10 Stück, im Wareneingang sind nur 8 gebucht. Die Software findet die Abweichung automatisch und sperrt die Zahlung bis zur Klärung.",
          "Ergo-Tec orders 10 electric actuators to build medical examination tables. The supplier invoices 10 units, but only 8 are booked in goods receipt. The software detects the discrepancy automatically and blocks payment until it is clarified."
        )}
      </div>

      <Card step="1" title={L("E-Rechnung importieren", "Import e-invoice")} right={inv && <Badge tone={STATUS[state.status].tone}>{tx(STATUS[state.status].label)}</Badge>}>
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files);
          }}
        >
          <p>
            {L(
              "XRechnung (XML, CII oder UBL) oder ZUGFeRD / Factur-X (PDF mit eingebettetem XML) hierher ziehen oder",
              "Drop an XRechnung (XML, CII or UBL) or ZUGFeRD / Factur-X (PDF with embedded XML) here, or"
            )}{" "}
            <button className="link" onClick={() => fileRef.current?.click()}>
              {L("Datei auswählen", "choose a file")}
            </button>
            .
          </p>
          <input ref={fileRef} type="file" accept=".xml,.pdf" hidden onChange={(e) => onFile(e.target.files)} />
          <div className="row">
            <Button kind="primary" disabled={busy} onClick={() => handleImport(enc(invoiceXml), SAMPLE_FILES.invoiceXml, sample)}>
              {L("Musterrechnung laden (XRechnung)", "Load sample invoice (XRechnung)")}
            </Button>
            <Button disabled={busy} onClick={() => handleImport(base64ToBytes(invoicePdf), SAMPLE_FILES.invoicePdf, sample)}>
              {L("Musterrechnung laden (ZUGFeRD-PDF)", "Load sample invoice (ZUGFeRD PDF)")}
            </Button>
          </div>
          <div className="row small">
            {L("Musterdateien zum Ausprobieren des Uploads:", "Sample files to try the upload:")}
            <button className="link" onClick={() => download(SAMPLE_FILES.invoiceXml, invoiceXml, "application/xml")}>
              XRechnung
            </button>
            ·
            <button className="link" onClick={() => download(SAMPLE_FILES.invoicePdf, base64ToBytes(invoicePdf), "application/pdf")}>
              {L("ZUGFeRD-PDF", "ZUGFeRD PDF")}
            </button>
            ·
            <button className="link" onClick={() => download(SAMPLE_FILES.correctionXml, correctionXml, "application/xml")}>
              {L("Korrekturrechnung", "Corrected invoice")}
            </button>
          </div>
        </div>
        {busy && <p className="muted">{L("Rechnung wird mit der XCAN-Engine gelesen …", "Reading the invoice with the XCAN engine …")}</p>}
        {error && (
          <div className="alert alert-err">
            {L("Import fehlgeschlagen:", "Import failed:")} {error}
          </div>
        )}
      </Card>

      {inv && <InvoiceData inv={inv} replaced={state.replaced} />}
      {inv && match && (
        <MatchCard match={match} stale={state.matchStale} onRematch={rematch} locked={state.status === "FREIGEGEBEN"} receipts={receiptsOf(state)} inv={inv} />
      )}

      {inv && match && (
        <Card step="4" title={L("Klärung und Zahlungsfreigabe", "Clarification and payment approval")} tone={state.status === "FREIGEGEBEN" ? "ok" : state.status === "ABGEGLICHEN" ? undefined : "warn"}>
          {state.status === "FREIGEGEBEN" && state.approval ? (
            <div className="alert alert-ok">
              <strong>{L("Zur Zahlung freigegeben:", "Approved for payment:")}</strong>{" "}
              {L(
                `${eur(state.approval.amount)} an ${inv.senderName}, fällig ${dateDe(inv.dueDate as any)}. Freigabe durch ${tx(state.approval.by)}, ${timeDe(state.approval.at)}`,
                `${eur(state.approval.amount)} to ${inv.senderName}, due ${dateDe(inv.dueDate as any)}. Approved by ${tx(state.approval.by)}, ${timeDe(state.approval.at)}`
              )}
              {state.approval.withException && L(" – mit dokumentierter Ausnahme", " – with documented exception")}.
            </div>
          ) : !match.ok && !state.exception ? (
            <>
              <div className="alert alert-err">
                <strong>{L("Zahlungsfreigabe gesperrt.", "Payment approval blocked.")}</strong>{" "}
                {L(
                  `${match.lines.filter((l) => l.issues.length).length} Position(en) weichen ab – zu viel berechnet:`,
                  `${match.lines.filter((l) => l.issues.length).length} line(s) deviate – overbilled:`
                )}{" "}
                <strong>
                  {eur(match.overbilledNet)} {L("netto", "net")}
                </strong>{" "}
                ({eur(match.overbilledGross)} {L("brutto", "gross")}).
              </div>
              {!state.clarification ? (
                <div className="row">
                  <Button kind="primary" onClick={openClarification}>
                    {L("Klärung starten", "Start clarification")}
                  </Button>
                  <span className="muted small">
                    {L(
                      `Übergibt den Fall an ${ACTORS.einkauf.de} und bereitet die Anfrage an den Lieferanten vor.`,
                      `Hands the case to ${ACTORS.einkauf.en} and drafts the request to the supplier.`
                    )}
                  </span>
                </div>
              ) : (
                <Resolution
                  state={state}
                  onCorrection={() => handleImport(enc(correctionXml), SAMPLE_FILES.correctionXml, sample)}
                  onUploadCorrection={() => fileRef.current?.click()}
                  onFollowUp={bookFollowUp}
                  reason={reason}
                  setReason={setReason}
                  onAccept={acceptException}
                  followUpBooked={state.extraReceipts.some((r) => r.number === FOLLOW_UP_RECEIPT.number)}
                />
              )}
            </>
          ) : (
            <div className="alert alert-ok">
              {state.exception
                ? L(`Abweichung von ${tx(state.exception.by)} akzeptiert: „${state.exception.reason}“`, `Discrepancy accepted by ${tx(state.exception.by)}: "${state.exception.reason}"`)
                : L(
                    `Rechnung, Bestellung und Wareneingang stimmen überein${state.replaced.length ? " (nach Korrektur durch den Lieferanten)" : ""}.`,
                    `Invoice, purchase order and goods receipt match${state.replaced.length ? " (after the supplier's correction)" : ""}.`
                  )}
            </div>
          )}
          <div className="row approve-row">
            <Button kind="primary" disabled={!canApprove} reason={approveReason} onClick={approve}>
              {L("Zur Zahlung freigeben", "Approve for payment")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function matchLogText(r: MatchResult): Txt {
  if (r.ok) return txt("Drei-Wege-Abgleich: keine Abweichungen.", "Three-way matching: no discrepancies.");
  const bad = r.lines.filter((l) => l.issues.length);
  const head = r.header.filter((h) => !h.ok);
  const part = (lang: "de" | "en") =>
    [
      ...bad.map((l) => `${lang === "de" ? "Pos." : "Line"} ${l.position} ${l.articleNo ?? ""} – ${l.issues.map((i) => i.message[lang]).join("; ")}`),
      ...head.map((h) => h.label[lang]),
    ].join(" | ");
  return txt(`Drei-Wege-Abgleich: ${part("de")}. Status: Klärung erforderlich.`, `Three-way matching: ${part("en")}. Status: clarification required.`);
}

/** The request goes to a German supplier, so it is always written in German. */
function clarificationText(inv: ImportedInvoice, m: MatchResult): string {
  const d = (x: any) => {
    const s = typeof x === "string" ? x : x?.toISOString?.() ?? "";
    const mm = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return mm ? `${mm[3]}.${mm[2]}.${mm[1]}` : "";
  };
  const lines = m.lines
    .filter((l) => l.issues.length)
    .map((l) => `- Pos. ${l.position} ${l.articleNo ?? ""} ${l.description}: berechnet ${l.invoiced}, bestellt ${l.ordered ?? "–"}, geliefert ${l.received}`)
    .join("\n");
  return `Betreff: Rechnung ${inv.invoiceNumber} – Abweichung zu Bestellung ${inv.orderReference ?? ""}

Sehr geehrte Damen und Herren,

bei der Prüfung Ihrer Rechnung ${inv.invoiceNumber} vom ${d(inv.issueDate)} haben wir folgende Abweichung zum Wareneingang festgestellt:
${lines}

Differenz: ${eurDe(m.overbilledNet)} netto / ${eurDe(m.overbilledGross)} brutto.

Bitte senden Sie uns eine korrigierte Rechnung oder bestätigen Sie den Liefertermin der fehlenden Menge. Bis zur Klärung ist die Zahlung angehalten.

Mit freundlichen Grüßen
${ACTORS.einkauf.de}, Ergo-Tec GmbH`;
}

function InvoiceData({ inv, replaced }: { inv: ImportedInvoice; replaced: ImportedInvoice[] }) {
  const r = getLang() === "en" && inv.validationReportEn ? inv.validationReportEn : inv.validationReport;
  return (
    <Card step="2" title={L("Ausgelesene Rechnungsdaten", "Extracted invoice data")} right={<span className="muted small">{L("gelesen mit XCAN invoice-extractor", "read with XCAN invoice-extractor")}</span>}>
      {replaced.length > 0 && (
        <div className="alert alert-info">
          {L("Ersetzt:", "Replaced:")} {replaced.map((x) => `${x.invoiceNumber} (${eur(x.grossTotal)})`).join(", ")} –{" "}
          {L("bleibt im Verlauf nachvollziehbar.", "remains traceable in the history.")}
        </div>
      )}
      <div className="grid-3">
        <dl className="fields">
          <Field label={L("Rechnungsnummer", "Invoice number")} mono>
            {inv.invoiceNumber}
          </Field>
          <Field label={L("Dokumentart", "Document type")}>{typeLabel(inv.typeCode)}</Field>
          {inv.precedingInvoiceNumber && <Field label={L("Bezug (BT-25)", "Preceding invoice (BT-25)")}>{inv.precedingInvoiceNumber}</Field>}
          <Field label={L("Rechnungsdatum", "Invoice date")}>{dateDe(inv.issueDate as any)}</Field>
          <Field label={L("Fällig am", "Due date")}>{dateDe(inv.dueDate as any)}</Field>
          <Field label="Format">{inv.format}</Field>
        </dl>
        <dl className="fields">
          <Field label={L("Lieferant", "Supplier")}>{inv.senderName}</Field>
          <Field label={L("Anschrift", "Address")}>{[inv.senderStreet, inv.senderCity, inv.senderCountry].filter(Boolean).join(", ")}</Field>
          <Field label={L("USt-IdNr.", "VAT ID")} mono>
            {inv.senderVatId ?? "–"}
          </Field>
          <Field label={L("Empfänger", "Buyer")}>{inv.buyerName ?? "–"}</Field>
          <Field label={L("Bestellnummer (BT-13)", "Order number (BT-13)")} mono>
            {inv.orderReference ?? <Badge tone="err">{L("fehlt", "missing")}</Badge>}
          </Field>
        </dl>
        <dl className="fields totals">
          <Field label={L("Netto", "Net")}>{eur(inv.netTotal)}</Field>
          <Field label={L("USt", "VAT")}>{eur(inv.vatTotal)}</Field>
          <Field label={L("Brutto", "Gross")}>
            <strong>{eur(inv.grossTotal)}</strong>
          </Field>
          <Field label="EN 16931 (XCAN)">
            {r.isCompliant ? (
              <Badge tone="ok">
                {L("konform", "compliant")} · {r.passedChecks}/{r.totalChecks}
              </Badge>
            ) : (
              <Badge tone="err">
                {r.failedChecks} {L("Fehler", "errors")}
              </Badge>
            )}
            {r.warningChecks > 0 && (
              <Badge tone="warn">
                {r.warningChecks} {L("Hinweis(e)", "warning(s)")}
              </Badge>
            )}
          </Field>
        </dl>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{L("Pos.", "Line")}</th>
            <th>{L("Artikel (BT-155)", "Article (BT-155)")}</th>
            <th>{L("Bezeichnung", "Description")}</th>
            <th>{L("Best.-Pos. (BT-132)", "PO line (BT-132)")}</th>
            <th className="r">{L("Menge", "Qty")}</th>
            <th className="r">{L("Einzelpreis", "Unit price")}</th>
            <th className="r">{L("USt", "VAT")}</th>
            <th className="r">{L("Netto", "Net")}</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.position}>
              <td>{it.position}</td>
              <td className="mono">{it.sellerItemId ?? "–"}</td>
              <td>{it.description}</td>
              <td className="mono">{it.orderLineId ?? "–"}</td>
              <td className="r">{num(it.quantity)}</td>
              <td className="r">{eur(it.unitPrice)}</td>
              <td className="r">{it.vatRate} %</td>
              <td className="r">{eur(it.netTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Collapsible label={L(`Prüfprotokoll EN 16931 (${r.totalChecks} Regeln)`, `EN 16931 check report (${r.totalChecks} rules)`)}>
        <ul className="checks">
          {r.checks.map((c) => (
            <li key={c.id} className={`check-${c.status.toLowerCase()}`}>
              <span className="check-icon">{c.status === "PASS" ? "✓" : c.status === "WARN" ? "!" : "✕"}</span>
              <span className="mono">{c.id}</span> {c.name}
              {c.details && <span className="muted"> – {c.details}</span>}
            </li>
          ))}
        </ul>
      </Collapsible>
      <Collapsible label={L("XML-Quelltext", "XML source")}>
        <pre className="code">{inv.rawXml}</pre>
      </Collapsible>
    </Card>
  );
}

function MatchCard({
  match,
  stale,
  onRematch,
  locked,
  receipts,
  inv,
}: {
  match: MatchResult;
  stale: boolean;
  onRematch: () => void;
  locked: boolean;
  receipts: GoodsReceipt[];
  inv: ImportedInvoice;
}) {
  const po = PURCHASE_ORDER;
  const relevant = receipts.filter((r) => r.orderNumber === po.number);
  return (
    <Card
      step="3"
      title={L("Drei-Wege-Abgleich", "Three-way matching")}
      tone={stale ? "warn" : undefined}
      right={
        <div className="row">
          <span className="muted small">
            {L("zuletzt", "last run")} {timeDe(match.ranAt)}
          </span>
          <Button kind={stale ? "primary" : "secondary"} onClick={onRematch} disabled={locked} title={L("Abgleich mit aktuellem Wareneingang erneut ausführen", "Run the matching again with the current goods receipts")}>
            {L("Abgleich wiederholen", "Repeat matching")}
          </Button>
        </div>
      }
    >
      {stale && <div className="alert alert-warn">{L("Die Datenlage hat sich geändert. Bitte den Abgleich wiederholen.", "The data has changed. Please repeat the matching.")}</div>}
      <div className="docs3">
        <div className="doc">
          <div className="doc-kind">{L("Bestellung", "Purchase order")}</div>
          <div className="mono">{po.number}</div>
          <div className="muted small">
            {dateDe(po.date)} · {po.buyer}
          </div>
          <div className="muted small">{po.purpose}</div>
        </div>
        <div className="doc">
          <div className="doc-kind">{L("Wareneingang", "Goods receipt")}</div>
          {relevant.map((r) => (
            <div key={r.number}>
              <span className="mono">{r.number}</span>{" "}
              <span className="muted small">
                {dateDe(r.date)} · {r.deliveryNote}
              </span>
            </div>
          ))}
        </div>
        <div className="doc">
          <div className="doc-kind">{L("Rechnung", "Invoice")}</div>
          <div className="mono">{inv.invoiceNumber}</div>
          <div className="muted small">
            {dateDe(inv.issueDate as any)} · {eur(inv.grossTotal)}
          </div>
        </div>
      </div>
      <ul className="header-checks">
        {match.header.map((h) => (
          <li key={h.id} className={h.ok ? "ok" : "err"}>
            {h.ok ? "✓" : "✕"} <strong>{tx(h.label)}:</strong> {tx(h.details)}
          </li>
        ))}
      </ul>
      <table className="table match">
        <thead>
          <tr>
            <th>{L("Pos.", "Line")}</th>
            <th>{L("Artikel", "Article")}</th>
            <th>{L("Bezeichnung", "Description")}</th>
            <th className="r">{L("Bestellt", "Ordered")}</th>
            <th className="r">{L("Geliefert", "Received")}</th>
            <th className="r">{L("Berechnet", "Invoiced")}</th>
            <th className="r">{L("Preis Best.", "PO price")}</th>
            <th className="r">{L("Preis Rg.", "Inv. price")}</th>
            <th>{L("Ergebnis", "Result")}</th>
          </tr>
        </thead>
        <tbody>
          {match.lines.map((l) => (
            <MatchRow key={l.position} l={l} />
          ))}
        </tbody>
      </table>
      {match.openOrderLines.length > 0 && (
        <p className="muted small">
          {L("Nicht berechnete Bestellpositionen:", "Order lines not invoiced:")} {match.openOrderLines.map((o) => `${o.lineId} ${o.articleNo}`).join(", ")}
        </p>
      )}
      <div className={`summary ${match.ok ? "ok" : "err"}`}>
        {match.ok
          ? L("Keine Abweichungen – die Rechnung kann freigegeben werden.", "No discrepancies – the invoice can be approved.")
          : L(
              `Abweichung gefunden: ${eur(match.overbilledNet)} netto / ${eur(match.overbilledGross)} brutto zu viel berechnet.`,
              `Discrepancy found: ${eur(match.overbilledNet)} net / ${eur(match.overbilledGross)} gross overbilled.`
            )}
      </div>
    </Card>
  );
}

function MatchRow({ l }: { l: LineMatch }) {
  const bad = l.issues.length > 0;
  const qtyBad = l.issues.some((i) => i.status.startsWith("MENGE"));
  const priceBad = l.issues.some((i) => i.status === "PREISABWEICHUNG");
  return (
    <>
      <tr className={bad ? "row-err" : ""}>
        <td>{l.position}</td>
        <td className="mono">{l.articleNo ?? "–"}</td>
        <td>{l.description}</td>
        <td className="r">{l.ordered ?? "–"}</td>
        <td className={`r ${qtyBad ? "cell-err" : ""}`}>{num(l.received)}</td>
        <td className={`r ${qtyBad ? "cell-err" : ""}`}>{num(l.invoiced)}</td>
        <td className="r">{l.orderPrice !== null ? eur(l.orderPrice) : "–"}</td>
        <td className={`r ${priceBad ? "cell-err" : ""}`}>{eur(l.invoicePrice)}</td>
        <td>{bad ? <Badge tone="err">{L("Abweichung", "Discrepancy")}</Badge> : <Badge tone="ok">OK</Badge>}</td>
      </tr>
      {bad && (
        <tr className="row-err-detail">
          <td />
          <td colSpan={8}>
            {l.issues.map((i) => (
              <div key={i.status}>⚠ {tx(i.message)}</div>
            ))}
            {l.overbilledNet > 0 && (
              <div>
                {L("Differenz:", "Difference:")} {eur(l.overbilledNet)} {L("netto", "net")}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Resolution(props: {
  state: IncomingState;
  onCorrection: () => void;
  onUploadCorrection: () => void;
  onFollowUp: () => void;
  reason: string;
  setReason: (s: string) => void;
  onAccept: () => void;
  followUpBooked: boolean;
}) {
  const c = props.state.clarification!;
  return (
    <div className="resolution">
      <p>
        {L("In Klärung bei", "In clarification with")} <strong>{tx(c.assignee)}</strong> {L("seit", "since")} {timeDe(c.at)}.
      </p>
      <Collapsible label={L("Vorbereitete Klärungsanfrage an den Lieferanten", "Drafted clarification request to the supplier (German, as sent)")}>
        <pre className="letter">{c.request}</pre>
        <Button kind="ghost" onClick={() => navigator.clipboard?.writeText(c.request)}>
          {L("Text kopieren", "Copy text")}
        </Button>
      </Collapsible>
      <div className="options">
        <div className="option">
          <h4>{L("A · Korrekturrechnung des Lieferanten", "A · Supplier's corrected invoice")}</h4>
          <p className="muted small">
            {L(
              "Lieferant schickt RE-MH-2026-0418-K1 (384) über 8 Stück. Sie ersetzt die ursprüngliche Rechnung.",
              "The supplier sends RE-MH-2026-0418-K1 (384) for 8 units. It replaces the original invoice."
            )}
          </p>
          <div className="row">
            <Button kind="primary" onClick={props.onCorrection}>
              {L("Korrektur empfangen (Muster)", "Receive correction (sample)")}
            </Button>
            <Button kind="ghost" onClick={props.onUploadCorrection}>
              {L("Datei hochladen", "Upload file")}
            </Button>
          </div>
        </div>
        <div className="option">
          <h4>{L("B · Nachlieferung buchen", "B · Book follow-up delivery")}</h4>
          <p className="muted small">
            {L("Die fehlenden 2 Hubantriebe treffen ein (WE-2026-1004). Danach Abgleich wiederholen.", "The missing 2 actuators arrive (WE-2026-1004). Then repeat the matching.")}
          </p>
          <Button onClick={props.onFollowUp} disabled={props.followUpBooked} reason={L("Nachlieferung bereits gebucht", "Follow-up delivery already booked")}>
            {L("Wareneingang +2 buchen", "Book goods receipt +2")}
          </Button>
        </div>
        <div className="option">
          <h4>{L("C · Abweichung akzeptieren", "C · Accept discrepancy")}</h4>
          <p className="muted small">{L("Nur mit Begründung; wird im Verlauf dokumentiert.", "Only with a reason; recorded in the history.")}</p>
          <textarea
            value={props.reason}
            onChange={(e) => props.setReason(e.target.value)}
            placeholder={L("z. B. Restmenge per Telefon bestätigt, Lieferung KW 48", "e.g. remaining quantity confirmed by phone, delivery week 48")}
            rows={2}
          />
          <Button onClick={props.onAccept} disabled={props.reason.trim().length < 10} reason={L("Begründung (mind. 10 Zeichen) erforderlich", "Reason (at least 10 characters) required")}>
            {L("Mit Begründung akzeptieren", "Accept with reason")}
          </Button>
        </div>
      </div>
    </div>
  );
}
