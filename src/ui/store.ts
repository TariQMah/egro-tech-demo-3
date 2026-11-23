import { useEffect, useReducer } from "react";
import type { ImportedInvoice } from "../xcan/extract-ext";
import type { MatchResult } from "../domain/matching";
import type { FinalValidation } from "../domain/validate-final";
import type { GoodsReceipt } from "../domain/data";
import { txt, type Lang, type Txt } from "../i18n";

export type IncomingStatus = "LEER" | "KLAERUNG" | "IN_KLAERUNG" | "ABGEGLICHEN" | "FREIGEGEBEN";

export interface LogEntry {
  at: string;
  actor: Txt;
  area: "Eingang" | "Ausgang" | "Demo";
  text: Txt;
}

export interface IncomingState {
  invoice: ImportedInvoice | null;
  replaced: ImportedInvoice[];
  extraReceipts: GoodsReceipt[];
  match: MatchResult | null;
  matchStale: boolean;
  status: IncomingStatus;
  clarification: { assignee: Txt; at: string; request: string } | null;
  exception: { reason: string; by: Txt; at: string } | null;
  approval: { by: Txt; at: string; amount: number; withException: boolean } | null;
}

export interface GeneratedInvoice {
  createdAt: string;
  issueDate: string;
  dueDate: string;
  xml: string;
  pdfBase64: string;
  validation: FinalValidation;
}

export interface OutgoingState {
  issueDate: string;
  paymentDays: number;
  generated: GeneratedInvoice | null;
}

export interface DemoState {
  version: 2;
  lang: Lang;
  tab: "eingang" | "ausgang" | "verlauf";
  incoming: IncomingState;
  outgoing: OutgoingState;
  log: LogEntry[];
}

export const ACTORS = {
  einkauf: txt("A. Becker (Einkauf)", "A. Becker (Purchasing)"),
  kreditoren: txt("S. Braun (Kreditorenbuchhaltung)", "S. Braun (Accounts payable)"),
  debitoren: txt("M. Yilmaz (Debitorenbuchhaltung)", "M. Yilmaz (Accounts receivable)"),
  wareneingang: txt("K. Wolf (Wareneingang)", "K. Wolf (Goods receipt)"),
  system: txt("System (XCAN-Engine)", "System (XCAN engine)"),
};

const KEY = "ergotec.erechnung.demo.v2";

export function todayBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function initialState(): DemoState {
  return {
    version: 2,
    lang: "de",
    tab: "eingang",
    incoming: { invoice: null, replaced: [], extraReceipts: [], match: null, matchStale: false, status: "LEER", clarification: null, exception: null, approval: null },
    outgoing: { issueDate: todayBerlin(), paymentDays: 30, generated: null },
    log: [],
  };
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.version === 2) return s;
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return initialState();
}

export type Action =
  | { type: "tab"; tab: DemoState["tab"] }
  | { type: "lang"; lang: Lang }
  | { type: "incoming"; patch: Partial<IncomingState>; log?: Omit<LogEntry, "at" | "area"> | Omit<LogEntry, "at" | "area">[] }
  | { type: "outgoing"; patch: Partial<OutgoingState>; log?: Omit<LogEntry, "at" | "area"> | Omit<LogEntry, "at" | "area">[] }
  | { type: "reset" };

type LogInput = Omit<LogEntry, "at" | "area">;

function withLog(state: DemoState, area: LogEntry["area"], log?: LogInput | LogInput[]): LogEntry[] {
  if (!log) return state.log;
  const entries = (Array.isArray(log) ? log : [log]).map((l) => ({ ...l, area, at: new Date().toISOString() }));
  return [...entries.reverse(), ...state.log];
}

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "tab":
      return { ...state, tab: action.tab };
    case "lang":
      return { ...state, lang: action.lang };
    case "incoming":
      return { ...state, incoming: { ...state.incoming, ...action.patch }, log: withLog(state, "Eingang", action.log) };
    case "outgoing":
      return { ...state, outgoing: { ...state.outgoing, ...action.patch }, log: withLog(state, "Ausgang", action.log) };
    case "reset":
      return { ...initialState(), tab: state.tab, lang: state.lang };
  }
}

export function useDemoStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  return [state, dispatch] as const;
}
