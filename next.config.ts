import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// This computer's current Wi-Fi/LAN IP addresses (e.g. 192.168.1.23).
// Lets a phone on the same network open the dev server at http://<ip>:3000.
// Only affects `npm run dev`; production on Vercel ignores it.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
