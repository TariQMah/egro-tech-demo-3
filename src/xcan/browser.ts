/**
 * Browser setup for XCAN's libraries: Buffer global and the fonts / colour profile its ZUGFeRD
 * generator reads from assets/pdf (bundled from ../devoreo-erechnung/assets at build time).
 */
import { Buffer } from "buffer";
import { registerFile } from "../shims/fs";
import sansRegular from "@xcan-assets/pdf/LiberationSans-Regular.ttf?base64";
import sansBold from "@xcan-assets/pdf/LiberationSans-Bold.ttf?base64";
import icc from "@xcan-assets/pdf/sRGB-v2-magic.icc?base64";

(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

registerFile("LiberationSans-Regular.ttf", base64ToBytes(sansRegular));
registerFile("LiberationSans-Bold.ttf", base64ToBytes(sansBold));
registerFile("sRGB-v2-magic.icc", base64ToBytes(icc));
