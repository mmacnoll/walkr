# Walkr — Park Walk Route Generator: Plan

## Progress
**Phase 1**
- [x] M1. Project setup (code done; Google Cloud key setup is your manual step)
- [x] M2. Map display
- [ ] M3. Park data
- [ ] M4. Input form
- [ ] M5. Route generation
- [ ] M6. Results view
- [ ] M7. Loading and errors
- [ ] M8. Ship it

**Phase 2:** to be chosen after Phase 1 is live (see the ranking below).

## Context
This is a class project with two graded phases. The app makes a **loop walking route** in an NYC park. The user picks a park, an entrance, a walk length and a mood, and the app draws the loop on a map with its stops listed. Phase 1 is a working proof of concept, live on Vercel and usable on a phone. Phase 2 adds polish and stretch features.

**Your answers to my questions, built into the plan:**
- **Parks (12):** Central Park, Riverside Park, Morningside Park, Prospect Park, Madison Square Park, Union Square Park, Washington Square Park, The High Line, The Battery, Brooklyn Heights Promenade, Brooklyn Bridge Park, Walt Whitman Park.
- **Moods (4):** Scenic, Quiet, Coffee Stop, Lunch Spot. Lunch Spot puts one restaurant on the route.
- **Small and narrow parks:** the walk starts and ends at the park, but longer walks can continue onto nearby streets (see decision #4).
- **Start point:** a named park entrance picked from a short list, with a default for each park. No GPS in Phase 1.
- **Length:** a slider with a minutes/miles switch. Minutes become miles at about 3 mph (20 min per mile).
- **Coffee / Lunch:** the cafe or restaurant can be up to ~2 blocks outside the park edge.
- **Accounts:** GitHub, Vercel and Google Cloud billing are all ready. Node 24, git, the GitHub CLI and the Vercel CLI are installed.

---

## Key decisions (in plain language)

**1. Tech stack: I'm keeping yours.** Next.js (App Router) + TypeScript + Tailwind, with `@vis.gl/react-google-maps` for the map. That library is Google's official React wrapper, so we write `<Map>` and `<Marker>` instead of fiddling with the raw Google Maps setup. I'm adding two small helpers:
- `@googlemaps/polyline-codec` turns the route Google sends back into map coordinates.
- `vitest` lets us test the route-picking math without spending money on API calls.

**2. Two API keys, and the server key never reaches the browser.**
| Key | Env var | Used by | Restrictions |
|---|---|---|---|
| Browser key | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Map display only | HTTP referrers (`localhost:3000/*`, your `*.vercel.app` domain) + API limit: Maps JavaScript API only |
| Server key | `GOOGLE_MAPS_SERVER_KEY` | `/api/route` on the server | API limit: Places API (New) + Routes API only, plus daily request caps |

The `NEXT_PUBLIC_` prefix tells Next.js "it's OK to send this to the browser." The server key doesn't have that prefix, so Next.js keeps it on the server. We can't lock the server key to an IP address because Vercel's servers don't have fixed IPs. Instead, API limits and daily quota caps are the safety net.

**3. Hand-picked landmarks plus live Places data.** Each park's JSON file lists 4–10 famous spots (Bethesda Fountain, the Washington Square Arch, Pier 1 at Brooklyn Bridge Park…), each tagged with the moods it fits. Places API (New) adds live results on top: cafes, restaurants, gardens and other spots. Why both? Places search inside parks is patchy, and small parks like Walt Whitman Park have few tagged places. The hand-picked list means every park + mood combination still makes a good route, and coffee and lunch spots are always live and real.

**3b. Three kinds of park.** Each park in the data gets a `kind`, which changes how its loop is built:
- **Large** (Central, Riverside, Prospect, Brooklyn Bridge Park): the loop stays inside the park boundary.
- **Medium** (Morningside): treated like a small park. Short walks stay inside, and longer walks can pass nearby spots like Columbia or the Cathedral of St. John the Divine.
- **Small** (Madison Sq, Union Sq, Washington Sq, The Battery, Walt Whitman): short walks stay inside. Longer walks use a "walk zone" around the park (a radius of ~0.5–1 mi, sized to the walk length), so stops can be nearby streets, plazas or even another park. For example, Union Square → Madison Square → back.
- **Linear** (High Line, Brooklyn Heights Promenade): the walk goes along the park and comes back on parallel streets. The High Line, for example, returns along 10th Ave or the Hudson River Greenway. Neighborhood stops are added if the walk needs more length.

In every case the route starts and ends at the chosen entrance, and stops inside the park score higher than stops outside it.

**4. How the loop is built (the core method).** Think of it as "draw a rough circle of the right size, then snap it to real places":
1. **Target:** convert the input to a distance in meters (e.g. 30 min = 1.5 mi ≈ 2,400 m).
2. **Candidates:** collect points of interest that fit the mood and sit in the search area. That's the park boundary for large parks, or the walk zone for small and linear parks (see 3b). Cafes and restaurants can be just outside it. Score each one by how well it fits the mood, with a bonus for being inside the park.
3. **Pick and order:** sort candidates by their compass direction from the entrance, then walk around the circle picking high-scoring stops. This keeps the path from zig-zagging back and forth. Keep adding stops until the *estimated* loop length reaches the target. The estimate is straight-line distance × 1.3, because paths curve. Coffee Stop always includes exactly one cafe, and Lunch Spot exactly one restaurant, placed roughly mid-walk. For linear parks, the "circle" is stretched along the park.
4. **Check with Google:** send entrance → stops → entrance to the Routes API in walking mode. Google returns the real distance, time and path.
5. **Retry:** if the real distance is more than 15% off target, drop or add a stop (or swap for a closer or farther one) and try again. Stop after 3 tries.
6. **Fallback:** if nothing lands within ±15%, return the closest attempt with a note like "This loop is 2.1 mi instead of 1.5 mi." If there are no usable stops at all, return a simple loop through the park's hand-picked landmarks.

This caps each request at about 1 Places call and 1–4 Routes calls, so costs stay low and predictable.

**5. Keeping costs down.** API "field masks" ask Google for only the fields we need, which puts each call in a cheaper pricing tier. Places results are cached in server memory per park + mood for a few minutes. With Google's monthly free usage, class-scale traffic should cost about $0. The budget alert and quota caps make sure of it.

---

## Phase 1: Proof of concept (must ship)

### M1. Project setup — *Easy*
- `create-next-app` (TypeScript, Tailwind, ESLint, App Router, `src/` dir), then `git init`.
- Add `.env.local` (in `.gitignore`) and `.env.example` with placeholder values. Save this plan as `PLAN.md`.
- **Google Cloud walkthrough** (I'll give you click-by-click steps, and you do the clicking):
  1. Enable the Maps JavaScript API, Places API (New) and Routes API.
  2. Create the browser key and the server key, with the restrictions in the table above.
  3. Set quota caps (e.g. 500 requests/day each on Places and Routes).
  4. Create a Map ID, which the map's newer marker style needs.
  5. Set a budget alert at $10 with email alerts at 50/90/100%.
- **Acceptance:** `npm run dev` shows the starter page. `git ls-files` includes `.env.example` and not `.env.local`. I run a secret scan of tracked files before the first commit. ✅ First commit.

### M2. Map display — *Easy*
- Full-screen `<Map>` component using the browser key, centered on Central Park.
- **Acceptance:** the map loads on desktop and on a phone-width screen, with no key errors in the browser console.

### M3. Park data — *Medium* (12 parks of hand-entered data)
- `src/data/parks.json`: the 12 parks, each with `id`, `name`, `borough`, `kind` (large / small / linear), `center`, `entrances[]` (name + coordinates, one marked default; 2–4 per park), a rough `boundary` polygon (~6–15 points) and `landmarks[]` (name, coordinates, mood tags).
- TypeScript types plus a small `geo.ts` with distance, compass direction, "is this point inside the park" and "is this point near the park edge."
- Picking a park moves the map there and outlines the boundary.
- **Acceptance:** all 12 parks show a sensible outline. The High Line and the Promenade show as narrow strips. The `geo.ts` unit tests pass.
- *Effort note:* entering accurate data for 12 parks by hand is the slowest part. I'll draft it, and you sanity-check the entrances and landmarks, since you know these parks.

### M4. Input form — *Medium*
- Mobile-first bottom sheet (a sidebar on desktop) with: park, entrance (filtered to the chosen park), length slider with a min/mi switch (10–90 min / 0.5–4.5 mi), park picker grouped by borough (Manhattan / Brooklyn), mood buttons (Scenic / Quiet / Coffee Stop / Lunch Spot), and a "Generate walk" button.
- **Acceptance:** usable with a thumb at 375px width. Changing the park resets the entrance. The form produces a valid request object (logged to the console for now).

### M5. Route generation (core logic) — *Hard*
- `src/lib/places.ts`: Places API (New) Nearby Search with mood-based place types:
  - Scenic: tourist_attraction, historical_landmark, monument, plus water and viewpoint landmarks
  - Quiet: garden, botanical_garden, plus quiet-tagged landmarks
  - Coffee: cafe, coffee_shop
  - Lunch: restaurant, sandwich_shop, deli, plus others like food court. Ranked by rating, with a minimum number of reviews. Places open now come first.
  - Results are filtered by the park's search area (decision 3b).
- `src/lib/loop.ts`: the picking + retry method from decision #4. This is pure logic, unit tested with fake distances.
- `src/lib/routes.ts`: Routes API `computeRoutes` in WALK mode with in-between stops.
- `src/app/api/route/route.ts`: POST endpoint. It checks the input, runs the steps above, and returns `{ polyline, distanceMeters, durationSeconds, stops[], withinTarget, note? }`.
- **Acceptance:** for all 12 parks × 4 moods × (20, 45 min), the endpoint returns a loop that starts and ends at the entrance. Most land within ±15% of the target. Coffee routes include a real cafe and Lunch routes a real restaurant. Small and linear parks produce sensible neighborhood loops at 45 min. Viewing the page source shows no server key. (I'll write a small script to run this matrix rather than clicking through 96 combinations.)

### M6. Results view — *Medium*
- Draw the route line, an entrance marker and numbered stop markers. Zoom the map to fit the route.
- The sheet switches to a results panel: distance, time, numbered stop list (tapping a stop centers the map on it), and "Try another" / "Edit" buttons.
- **Acceptance:** the full flow works end to end locally, and on a phone over your home Wi-Fi.

### M7. Loading and errors — *Easy–Medium*
- Spinner and disabled button while generating. Friendly messages for: no internet, Google errors or quota hit, and no good loop found (show the fallback and its note). A 15-second timeout. The server logs real errors, and users never see raw ones.
- **Acceptance:** I simulate each failure (bad key, blocked request, impossible input) and each one shows a clear message, not a crash.

### M8. Ship it — *Medium*
- README: what the app does, screenshots, setup steps, env vars, and the key-security notes.
- Run `gh auth login`. Then switch the commit email from the `markm@walkr.invalid` placeholder to your GitHub no-reply address and rewrite earlier commits (safe because nothing is pushed yet).
- Create a GitHub repo with `gh` (you pick public or private) and push.
- Import the repo into Vercel, set both env vars, and deploy. Add the Vercel domain to the browser key's referrer list.
- **Acceptance (= Phase 1 done):** on your phone, the live Vercel URL → choose park, length and mood → a real walking loop is drawn with its stops listed.

---

## Phase 2: Polish and stretch (ranked by impact ÷ effort)

| Rank | Feature | Impact | Effort | Notes |
|---|---|---|---|---|
| 1 | **Shareable links** | High | Low | Put the park, entrance, length, mood and stop IDs in the URL so the route can be rebuilt. Easy to show off in class. |
| 2 | **AI route description** | High | Low | One server call to Claude (`claude-haiku-4-5`) for a short, fun blurb. Needs an Anthropic key. |
| 3 | **Design polish + PWA** | High | Medium | Branding, animations, dark mode, "Add to Home Screen". |
| 4 | **Analytics** | Medium (great for the presentation) | Low | Vercel Analytics plus custom events for park and mood. |
| 5 | **Weather + golden hour** | Medium | Low–Med | Open-Meteo is free with no key and includes sunset times. |
| 6 | **Save favorites (localStorage)** | Medium | Low | Supabase with sign-in is a separate, harder step later. |
| 7 | **"Good for" tags** | Medium | Medium | Date / family / solo change how stops are scored. Fits easily into the M5 logic. |
| 8 | **More parks + "near me"** | Medium | Medium | Mostly data work (e.g. Fort Tryon, Hudson River Park, Domino Park), plus a location prompt. |
| 9 | **Live GPS mode** | Medium | Medium–High | Show the blue dot on the route. Needs HTTPS (Vercel has it) and a lot of phone testing. |
| 10 | **Accessibility / terrain** | Medium | High | The Elevation API helps with hills, but stroller-friendly path data is limited. |

Suggested Phase 2 set: ranks 1–5. We'll decide together once Phase 1 is live.

---

## How we'll work
- One milestone at a time. After each one: what changed, how to test with `npm run dev`, a commit with a clear message, and `PLAN.md` ticked.
- Anything that can't be done well in Phase 1 moves to Phase 2.
- You do the Google Cloud, GitHub and Vercel account clicks. I give exact steps and run the CLI commands.

## Verification (overall)
- `npm run lint`, `npx tsc --noEmit` and `npx vitest run` pass at every commit.
- Scripted matrix at the end of M5: 12 parks × 4 moods × 2 lengths, checking distance accuracy and stop quality. Then spot-check on the map in M6–M7.
- Security checks: `git ls-files | grep env` shows only `.env.example`; the server key's text is absent from the `.next/static` build output; and the browser key fails when loaded from an unlisted domain.
- Final check on a real phone against the live Vercel URL.
