import type { LatLng } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Straight-line ("as the crow flies") distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass direction from a to b: 0 = north, 90 = east, 180 = south, 270 = west. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Is the point inside the polygon? (Standard "ray casting" test.) */
export function isInsidePolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Shortest distance in meters from the point to the polygon's outline.
 * Uses a flat-earth approximation, which is accurate to well under 1% at park scale.
 */
export function distanceToPolygonEdgeMeters(point: LatLng, polygon: LatLng[]): number {
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos(toRad(point.lat));
  const toXY = (p: LatLng) => ({
    x: (p.lng - point.lng) * mPerLng,
    y: (p.lat - point.lat) * mPerLat,
  });

  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = toXY(polygon[j]);
    const b = toXY(polygon[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    // Closest point on segment a→b to the origin (our point).
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

/** Inside the polygon, or outside but within `bufferMeters` of its edge. */
export function isWithinPolygonBuffer(point: LatLng, polygon: LatLng[], bufferMeters: number): boolean {
  return isInsidePolygon(point, polygon) || distanceToPolygonEdgeMeters(point, polygon) <= bufferMeters;
}

/** Bounding box of a set of points. */
export function boundsOf(points: LatLng[]) {
  return {
    north: Math.max(...points.map((p) => p.lat)),
    south: Math.min(...points.map((p) => p.lat)),
    east: Math.max(...points.map((p) => p.lng)),
    west: Math.min(...points.map((p) => p.lng)),
  };
}

/** Is the point inside any piece of a multi-piece outline? */
export function isInsideRings(point: LatLng, rings: LatLng[][]): boolean {
  return rings.some((ring) => isInsidePolygon(point, ring));
}

/** Shortest distance in meters from the point to the edge of any piece. */
export function distanceToRingsEdgeMeters(point: LatLng, rings: LatLng[][]): number {
  return Math.min(...rings.map((ring) => distanceToPolygonEdgeMeters(point, ring)));
}

/** Inside any piece, or within `bufferMeters` of an edge. */
export function isWithinRingsBuffer(point: LatLng, rings: LatLng[][], bufferMeters: number): boolean {
  return isInsideRings(point, rings) || distanceToRingsEdgeMeters(point, rings) <= bufferMeters;
}
