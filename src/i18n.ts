/**
 * UI language (German default, English optional). Texts are written as pairs where they are used:
 * L("Deutsch", "English"). Domain results carry both languages as Txt so stored results and log
 * entries switch language together with the UI.
 */
export type Lang = "de" | "en";
export interface Txt {
  de: string;
  en: string;
}

let current: Lang = "de";

export function setLang(lang: Lang) {
  current = lang;
}
export function getLang(): Lang {
  return current;
}
export function L(de: string, en: string): string {
  return current === "en" ? en : de;
}
export function tx(t: Txt | string | undefined): string {
  if (t === undefined) return "";
  return typeof t === "string" ? t : t[current];
}
export const txt = (de: string, en: string): Txt => ({ de, en });
