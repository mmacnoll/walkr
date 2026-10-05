// Browser side: ask our server for a walk, with a timeout and friendly error messages.
import type { WalkRequest, WalkResult } from "./walk";

export const CLIENT_TIMEOUT_MS = 15_000;

export class WalkError extends Error {
  constructor(
    message: string,
    /** Whether pressing "Try again" might help. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const MESSAGES = {
  offline: "You seem to be offline. Check your connection and try again.",
  timeout: "This is taking longer than usual. Please try again.",
  generic: "Something went wrong while building your walk. Please try again.",
};

export async function fetchWalk(
  request: WalkRequest & { avoid?: string[] },
  { fetchImpl = fetch, timeoutMs = CLIENT_TIMEOUT_MS, isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false } = {},
): Promise<WalkResult> {
  if (!isOnline()) throw new WalkError(MESSAGES.offline, true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new WalkError(MESSAGES.timeout, true);
    // fetch only throws like this when the network itself failed.
    throw new WalkError(isOnline() ? MESSAGES.generic : MESSAGES.offline, true);
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new WalkError(MESSAGES.generic, true);
  }
  if (!res.ok) {
    const message = (json as { error?: string })?.error ?? MESSAGES.generic;
    // Bad input (400) won't fix itself by retrying; server hiccups might.
    throw new WalkError(message, res.status >= 500);
  }
  return json as WalkResult;
}
