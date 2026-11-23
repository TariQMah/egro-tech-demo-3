// Clicks through both scenarios in Chrome against dist/index.html (file://). Usage: node scripts/e2e.mjs [screenshotDir]
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const shots = process.argv[2] || "e2e-shots";
fs.mkdirSync(shots, { recursive: true });
const url = "file://" + path.resolve("dist/index.html");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const expectText = async (t) => {
  await page.getByText(t, { exact: false }).first().waitFor({ timeout: 8000 });
  console.log("  ✓", t);
};

await page.goto(url);
console.log("Szenario 1");
await page.getByRole("button", { name: "Musterrechnung laden (XRechnung)" }).click();
await expectText("Klärung erforderlich – Zahlung gesperrt");
await expectText("Berechnet 10 Stück, geliefert 8");
await expectText("970,00 € netto");
await shot("01-abweichung");
const approve = page.getByRole("button", { name: "Zur Zahlung freigeben" });
if (!(await approve.isDisabled())) throw new Error("Freigabe sollte gesperrt sein");
console.log("  ✓ Freigabe gesperrt");
await page.getByRole("button", { name: "Klärung starten" }).click();
await expectText("In Klärung bei");
await page.getByRole("button", { name: "Wareneingang +2 buchen" }).click();
await expectText("Bitte den Abgleich wiederholen");
if (!(await approve.isDisabled())) throw new Error("Freigabe vor Re-Match sollte gesperrt sein");
await page.getByRole("button", { name: "Abgleich wiederholen" }).click();
await expectText("Keine Abweichungen");
await approve.click();
await expectText("Zur Zahlung freigegeben:");
await shot("02-freigegeben");

console.log("Szenario 1b: Korrekturrechnung (ZUGFeRD-Import)");
await page.getByRole("button", { name: "Musterrechnung laden (ZUGFeRD-PDF)" }).click();
await expectText("ZUGFeRD / Factur-X");
await expectText("Klärung erforderlich");
await page.getByRole("button", { name: "Klärung starten" }).click();
await page.getByRole("button", { name: "Korrektur empfangen (Muster)" }).click();
await expectText("Ersetzt: RE-MH-2026-0418");
await expectText("Rechnungskorrektur (384)");
await expectText("Keine Abweichungen");
await approve.click();
await expectText("Zur Zahlung freigegeben:");

console.log("Szenario 2");
await page.getByRole("button", { name: /2 · Schlussrechnung/ }).click();
await expectText("41.650,00 €");
await page.getByRole("button", { name: "Schlussrechnung erzeugen" }).click();
await expectText("gültig ·");
await shot("03-schlussrechnung");
const failed = await page.locator(".check-fail").count();
if (failed) throw new Error(`${failed} Prüfungen fehlgeschlagen`);
console.log("  ✓ keine fehlgeschlagenen Prüfungen");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "XRechnung (XML)" }).click()]);
await dl.saveAs(`${shots}/${dl.suggestedFilename()}`);
const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZUGFeRD (PDF/A-3)" }).click()]);
await dl2.saveAs(`${shots}/${dl2.suggestedFilename()}`);
console.log("  ✓ Downloads:", dl.suggestedFilename(), dl2.suggestedFilename());
await page.getByRole("tab", { name: "ZUGFeRD-PDF" }).click();
await page.waitForTimeout(800);
await page.getByRole("tab", { name: "Rechnungsansicht" }).click();

console.log("Persistenz + Verlauf");
await page.reload();
await expectText("gültig ·");
await page.getByRole("button", { name: /Verlauf/ }).click();
await expectText("Schlussrechnung SR-2026-0019 erzeugt");
await shot("04-verlauf");
console.log("English");
await page.getByRole("button", { name: "EN", exact: true }).click();
await expectText("History (audit trail)");
await expectText("Final invoice SR-2026-0019 generated");
await page.getByRole("button", { name: /1 · Incoming invoice/ }).click();
await page.getByRole("button", { name: "Reset demo" }).click();
await page.getByRole("button", { name: "Yes", exact: true }).click();
await page.getByRole("button", { name: "Load sample invoice (XRechnung)" }).click();
await expectText("Clarification required – payment blocked");
await expectText("Invoiced 10 units, delivered 8");
await expectText("€970.00 net");
await page.getByRole("button", { name: "Start clarification" }).click();
await page.getByRole("button", { name: "Book goods receipt +2" }).click();
await page.getByRole("button", { name: "Repeat matching" }).click();
await expectText("No discrepancies");
await page.getByRole("button", { name: "Approve for payment" }).click();
await expectText("Approved for payment:");
await page.getByRole("button", { name: /2 · Final invoice/ }).click();
await page.getByRole("button", { name: "Generate final invoice" }).click();
await expectText("valid ·");
await expectText("Net prices not negative");
await shot("06-english");
if (await page.locator(".check-fail").count()) throw new Error("EN: Prüfungen fehlgeschlagen");
const leftovers = await page.evaluate(() => {
  const words = ["Klärung", "Abgleich", "Rechnungsdaten", "Zahlungsfreigabe", "Bestellt", "Geliefert", "erzeugen", "Prüfung"];
  const text = Array.from(document.querySelectorAll("main, header, nav, footer"))
    .map((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll(".paper, pre, .code").forEach((x) => x.remove());
      return c.textContent;
    })
    .join(" ");
  return words.filter((w) => text.includes(w));
});
console.log(leftovers.length ? "  ! deutsche Wörter in EN-Ansicht: " + leftovers.join(", ") : "  ✓ keine deutschen UI-Wörter in EN-Ansicht");
await page.getByRole("button", { name: "DE", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: /1 · Eingangsrechnung/ }).click();
await shot("05-mobil");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(overflow ? "  ✕ horizontaler Overflow auf Mobil" : "  ✓ kein horizontaler Overflow auf Mobil");
await browser.close();
if (errors.length) {
  console.log("Browserfehler:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("E2E OK");
