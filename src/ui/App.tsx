import { useEffect, useState } from "react";
import { useDemoStore, type DemoState } from "./store";
import { IncomingView } from "./IncomingView";
import { OutgoingView } from "./OutgoingView";
import { timeDe } from "./format";
import { XCAN_ENGINE } from "../xcan";
import { L, setLang, tx, type Lang } from "../i18n";

export function App() {
  const [state, dispatch] = useDemoStore();
  const [confirmReset, setConfirmReset] = useState(false);
  // Set before the children render, so every L()/tx() call in this pass uses the chosen language.
  setLang(state.lang);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.title = L("Ergo-Tec E-Rechnung Demo", "Ergo-Tec E-Invoicing Demo");
  }, [state.lang]);

  const tabs: Array<{ id: DemoState["tab"]; label: string; hint?: string }> = [
    { id: "eingang", label: L("1 · Eingangsrechnung", "1 · Incoming invoice"), hint: incomingHint(state) },
    {
      id: "ausgang",
      label: L("2 · Schlussrechnung", "2 · Final invoice"),
      hint: state.outgoing.generated ? (state.outgoing.generated.validation.ok ? L("erzeugt ✓", "generated ✓") : L("Fehler", "errors")) : undefined,
    },
    { id: "verlauf", label: L("Verlauf", "History"), hint: state.log.length ? String(state.log.length) : undefined },
  ];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">ET</div>
          <div>
            <div className="title">{L("Ergo-Tec · E-Rechnung", "Ergo-Tec · E-Invoicing")}</div>
            <div className="subtitle">{L("Eingangs- und Ausgangsrechnungen automatisiert", "Incoming and outgoing invoices, automated")}</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="engine" title={`${L("Quelle", "Source")}: ${XCAN_ENGINE.source}, Commit ${XCAN_ENGINE.commit}`}>
            Engine: <strong>{XCAN_ENGINE.name}</strong> <span className="mono">@{XCAN_ENGINE.commit}</span>
          </span>
          <span className="pill">{L("Musterdaten · simulierte ERP-Daten", "Sample data · simulated ERP data")}</span>
          <div className="lang" role="group" aria-label={L("Sprache", "Language")}>
            {(["de", "en"] as Lang[]).map((l) => (
              <button key={l} className={state.lang === l ? "active" : ""} aria-pressed={state.lang === l} onClick={() => dispatch({ type: "lang", lang: l })}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {confirmReset ? (
            <span className="confirm">
              {L("Demo wirklich zurücksetzen?", "Really reset the demo?")}
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: "reset" });
                  setConfirmReset(false);
                }}
              >
                {L("Ja", "Yes")}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                {L("Nein", "No")}
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
              {L("Demo zurücksetzen", "Reset demo")}
            </button>
          )}
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={state.tab === t.id ? "active" : ""} onClick={() => dispatch({ type: "tab", tab: t.id })}>
            {t.label}
            {t.hint && <span className="tab-hint">{t.hint}</span>}
          </button>
        ))}
      </nav>
      <main>
        {state.tab === "eingang" && <IncomingView state={state.incoming} dispatch={dispatch} />}
        {state.tab === "ausgang" && <OutgoingView state={state.outgoing} dispatch={dispatch} />}
        {state.tab === "verlauf" && <LogView state={state} />}
      </main>
      <footer className="foot">
        {L(
          "Prototyp für die Demo. Import, Abgleich, Erzeugung und Validierung laufen echt im Browser auf Basis von XCAN E-Rechnung; Bestellungen, Wareneingänge, Aufträge und Zahlungen sind vorbereitete Testdaten. Es werden keine Daten versendet.",
          "Demo prototype. Import, matching, generation and validation really run in the browser on XCAN E-Rechnung; purchase orders, goods receipts, customer orders and payments are prepared test data. No data is sent anywhere."
        )}
      </footer>
    </div>
  );
}

function incomingHint(s: DemoState): string | undefined {
  switch (s.incoming.status) {
    case "KLAERUNG":
    case "IN_KLAERUNG":
      return L("Klärung", "clarification");
    case "ABGEGLICHEN":
      return L("abgeglichen", "matched");
    case "FREIGEGEBEN":
      return L("freigegeben ✓", "approved ✓");
    default:
      return undefined;
  }
}

const AREA = { Eingang: ["Eingang", "Incoming"], Ausgang: ["Ausgang", "Outgoing"], Demo: ["Demo", "Demo"] } as const;

function LogView({ state }: { state: DemoState }) {
  if (!state.log.length)
    return (
      <div className="view">
        <p className="muted">{L("Noch keine Einträge.", "No entries yet.")}</p>
      </div>
    );
  return (
    <div className="view">
      <section className="card">
        <header className="card-head">
          <h2>{L("Verlauf (Audit-Trail)", "History (audit trail)")}</h2>
        </header>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>{L("Zeitpunkt", "Time")}</th>
                <th>{L("Bereich", "Area")}</th>
                <th>{L("Wer", "Who")}</th>
                <th>{L("Was", "What")}</th>
              </tr>
            </thead>
            <tbody>
              {state.log.map((l, i) => (
                <tr key={i}>
                  <td className="nowrap">{timeDe(l.at)}</td>
                  <td>{L(AREA[l.area][0], AREA[l.area][1])}</td>
                  <td className="nowrap">{tx(l.actor)}</td>
                  <td>{tx(l.text)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
