import { inflate, deflate } from "pako";
import { Buffer } from "buffer";

export function inflateSync(data: Uint8Array): Buffer {
  return Buffer.from(inflate(data));
}
export function deflateSync(data: Uint8Array): Buffer {
  return Buffer.from(deflate(data));
}
export default { inflateSync, deflateSync };
