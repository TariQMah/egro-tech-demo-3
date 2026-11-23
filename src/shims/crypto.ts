// node:crypto.createHash stand-in. XCAN uses it only for the PDF file identifier, which needs to be
// a stable 32-character hex string, not a cryptographic digest.
function hash128(input: string): string {
  let h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h = h.map((v, k) => Math.imul(v ^ (c + k), 0x01000193 + k * 2) >>> 0);
  }
  return h.map((v) => v.toString(16).padStart(8, "0")).join("");
}

export function createHash(_alg: string) {
  let acc = "";
  const api = {
    update(data: string | Uint8Array) {
      acc += typeof data === "string" ? data : Array.from(data).join(",");
      return api;
    },
    digest(_enc?: string) {
      return hash128(acc);
    },
  };
  return api;
}
export default { createHash };
