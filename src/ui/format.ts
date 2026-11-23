import { getLang, txt, type Txt } from "../i18n";

const locale = () => (getLang() === "en" ? "en-GB" : "de-DE");
export const eur = (n: number) => n.toLocaleString(locale(), { style: "currency", currency: "EUR" });
export const num = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });

/** Accepts ISO date strings, Date objects and restored JSON dates. */
export function dateDe(d: string | Date | null | undefined): string {
  if (!d) return "–";
  const iso = typeof d === "string" ? d : d.toISOString();
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  return getLang() === "en" ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}.${m[2]}.${m[1]}`;
}

export function timeDe(iso: string): string {
  return new Date(iso).toLocaleString(locale(), { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" });
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const TYPE_CODES: Record<string, Txt> = {
  "380": txt("Rechnung (380)", "Commercial invoice (380)"),
  "381": txt("Gutschrift (381)", "Credit note (381)"),
  "384": txt("Rechnungskorrektur (384)", "Corrected invoice (384)"),
  "386": txt("Vorauszahlungsrechnung (386)", "Prepayment invoice (386)"),
};

export function download(name: string, data: string | Uint8Array, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
