// Phone bottom sheet: the three heights it can rest at, and where a drag should settle.

export type Snap = "peek" | "half" | "full";
export const SNAPS: Snap[] = ["peek", "half", "full"];

/** A finger moving faster than this (px per ms) is a flick: move one step that way. */
export const FLICK_SPEED = 0.5;

export type SnapHeights = Record<Snap, number>;

/** Pixel heights for each snap, given the screen height and the header (title bar) height. */
export function snapHeights(viewportHeight: number, headerHeight: number): SnapHeights {
  const peek = Math.round(headerHeight);
  const full = Math.max(peek, Math.round(viewportHeight * 0.85));
  const half = Math.min(full, Math.max(peek, Math.round(viewportHeight * 0.5)));
  return { peek, half, full };
}

/** Keeps a dragged height between the lowest and highest snap. */
export function clampHeight(height: number, heights: SnapHeights): number {
  return Math.min(heights.full, Math.max(heights.peek, height));
}

/**
 * Where to settle when the finger lifts.
 * @param velocity px/ms, positive = finger moving up (sheet growing)
 */
export function settle(height: number, velocity: number, from: Snap, heights: SnapHeights): Snap {
  if (Math.abs(velocity) >= FLICK_SPEED) {
    // Flick: one step in the direction of travel, measured from where the drag started.
    const i = SNAPS.indexOf(from) + (velocity > 0 ? 1 : -1);
    return SNAPS[Math.min(SNAPS.length - 1, Math.max(0, i))];
  }
  // Slow drag: the nearest snap.
  return SNAPS.reduce((best, s) => (Math.abs(heights[s] - height) < Math.abs(heights[best] - height) ? s : best));
}

/** Tapping the title bar: open a closed sheet to half, close an open one. */
export function toggle(current: Snap): Snap {
  return current === "peek" ? "half" : "peek";
}
