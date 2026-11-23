// Browser stand-in for the parts of node:fs that XCAN's ZUGFeRD generator uses (reading bundled fonts).
const files = new Map<string, Uint8Array>();

export function registerFile(name: string, data: Uint8Array) {
  files.set(name, data);
}

export function readFileSync(p: string): Uint8Array {
  const name = String(p).split(/[\\/]/).pop() || "";
  const data = files.get(name);
  if (!data) throw new Error(`Datei nicht eingebettet: ${name}`);
  return data;
}

export function existsSync(p: string): boolean {
  return files.has(String(p).split(/[\\/]/).pop() || "");
}

export default { readFileSync, existsSync, registerFile };
