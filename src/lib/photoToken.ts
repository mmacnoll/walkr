// Photo references handed to the browser are signed, so /api/photo only fetches photos our
// own server chose (otherwise anyone could use it to load any Google photo on our bill).
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  return `walkr-photo:${key}`;
}

const sign = (name: string) => createHmac("sha256", secret()).update(name).digest("base64url").slice(0, 22);

/** Google photo name ("places/ID/photos/ID") → token safe to send to the browser. */
export function signPhotoName(name: string): string {
  return `${Buffer.from(name).toString("base64url")}.${sign(name)}`;
}

/** Token → Google photo name, or null if it wasn't made by us (or was tampered with). */
export function verifyPhotoToken(token: string): string | null {
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length) return null;
  const name = Buffer.from(encoded, "base64url").toString();
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return null;
  const expected = Buffer.from(sign(name));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? name : null;
}
