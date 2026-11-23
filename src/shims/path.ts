// Minimal node:path for the browser bundle.
const join = (...parts: string[]) => parts.filter(Boolean).join("/").replace(/\/+/g, "/");
export const resolve = join;
export { join };
export const basename = (p: string) => p.split(/[\\/]/).pop() || "";
export default { join, resolve, basename };
