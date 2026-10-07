import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// This computer's current Wi-Fi/LAN IP addresses (e.g. 192.168.1.23).
// Lets a phone on the same network open the dev server at http://<ip>:3000.
// Only affects `npm run dev`; production on Vercel ignores it.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

// Standard hardening headers for every page and API response.
const securityHeaders = [
  // Other sites may not show Walkr inside a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Browsers must trust our declared file types instead of guessing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only our origin to other sites. Not "no-referrer": Google checks the referrer
  // against the browser key's allowed websites, so the map would stop loading.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Device features we don't use are switched off (location kept for a future "near me").
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
