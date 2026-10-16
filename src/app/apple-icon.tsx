import { ImageResponse } from "next/og";
import { LogoMark } from "./logoMark";

// iPhone home-screen icon (iOS rounds the corners itself, so this one is square).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LogoMark size={180} rounded={false} />, size);
}
