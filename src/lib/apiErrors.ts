import { RoutesError } from "./routes";

/** Turn a failure into a friendly message (details go to the server log, never to the user). */
export function errorResponse(err: unknown): Response {
  console.error("Route generation failed:", err);
  if (err instanceof RoutesError) {
    if (err.status === 429)
      return Response.json({ error: "We've hit today's limit for map requests. Please try again later." }, { status: 503 });
    if (err.status === 404)
      return Response.json({ error: "Couldn't find a walking route from this start. Try a different entrance or length." }, { status: 422 });
    if (err.status === 401 || err.status === 403)
      console.error("Google rejected the server key: check GOOGLE_MAPS_SERVER_KEY and its API restrictions.");
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
    return Response.json({ error: "Google Maps is taking too long to answer. Please try again." }, { status: 504 });
  return Response.json({ error: "Couldn't build a walk right now. Please try again." }, { status: 502 });
}
