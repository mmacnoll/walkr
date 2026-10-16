import { ImageResponse } from "next/og";
import { LogoMark } from "../../logoMark";

// Android / "install app" icons referenced by the web manifest: /pwa-icon/192 and /pwa-icon/512.
// Full-bleed square so it also works as a "maskable" icon (the loop sits inside the safe zone).
const SIZES = new Set([192, 512]);

export async function GET(_request: Request, ctx: { params: Promise<{ size: string }> }) {
  const px = Number((await ctx.params).size);
  if (!SIZES.has(px)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<LogoMark size={px} rounded={false} />, {
    width: px,
    height: px,
    headers: { "Cache-Control": "public, max-age=86400, immutable" },
  });
}
