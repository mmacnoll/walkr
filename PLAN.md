# Walkr — Park Walk Route Generator: Plan

## Progress
**Phase 1**
- [x] M1. Project setup (code done; Google Cloud key setup is your manual step)
- [x] M2. Map display
- [x] M3. Park data (reworked after your review; last sights finish when the daily Google quota resets)
- [x] M4. Input form
- [x] M5. Route generation (Scenic/Quiet tested on all 12 parks; Coffee/Lunch matrix runs once the Places quota resets)
- [x] M6. Results view
- [x] M7. Loading and errors
- [x] M8. Ship it (live at https://walkr-gamma.vercel.app)

Phase 1 saved as **v1.0.0** (tag + GitHub release, 2026-10-07).

**Phase 2: usability and Customize mode**
- [x] M9. Sliding panel
- [x] M10. Bigger sight dots + photos
- [x] M11. Customize mode
- [x] M12. Security headers + ship v2.0

Phase 2 saved as **v2.0.0** (tag + GitHub release, 2026-10-07).

Small update saved as **v2.0.1**: an always-visible Clear all button, with Undo.

**Phase 3: more ways to shape a walk, plus sharing (chosen 2026-10-09)**
- [x] M13. Mood + refreshment
- [x] M14. Extra stops: restroom, water, playground, dog run (on branch `m14-extra-stops`, not yet merged)
- [~] M15. Route preferences: well lit, waterfront (built, then reverted on 2026-10-15: results weren't good enough for the complexity; moved to Phase 4)
- [ ] M16. Shareable links
- [ ] M17. AI walk description
- [ ] M18. Save favorite walks
- [ ] M19. "Good for" tags
- [ ] M20. Design polish + Add to Home Screen + ship v3.0

**Phase 4:** see the list below.

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

**3. Where the map data comes from (revised during M3).**
- **Outlines and entrances come from OpenStreetMap**, a free, open map with a license that allows saving its data as long as we credit it on the map. `scripts/osm-fetch.mjs` downloads it, and `scripts/osm-build.mjs` turns it into outlines and entrances. An entrance is any spot where a walking path crosses the park edge, named after the nearby streets (e.g. "Central Park West & W 81st St"). Central Park has about 54. A few hand-picked entrances per park are marked `popular` for the short list.
- **Sights come from Google Places.** `scripts/fetch-sights.mjs` collects every qualifying place in each park: landmarks, statues, bridges, gardens, viewpoints and water. It skips restrooms, sports and recreation, shops and services. Google's terms allow storing only place IDs (forever) and coordinates (up to 30 days), so `src/data/sights.json` holds just those plus our own mood tags. Names are looked up live, only when a sight is shown. **Re-run `npm run refresh:sights` at least every 30 days**; a test fails as a reminder. A full refresh is about 400 searches, inside Google's free monthly allowance.
- **Coffee and lunch spots** are searched live when a route is built (1–2 searches).
- The original hand-picked landmarks stay in `parks.json` as a backup if Google is unreachable.

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
5. **Retry:** if the real distance is more than 15% off target, measure how winding this loop's paths really are (real ÷ straight-line distance). Then make *one* small change (drop, add or swap a stop), whichever brings the estimate closest to the target, and measure again. Up to 4 Routes calls. (Re-planning from scratch each round see-sawed, so small changes it is.) Test run: 48/48 Scenic/Quiet walks within ±15%, averaging 1.5 Routes calls.
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

### M3. Park data — *Medium → Hard* (revised after your review: real entrances and all sights)
- `src/data/parks.json`: the 12 parks with `kind`, `center`, OpenStreetMap outlines (one or more pieces), every entrance (popular ones flagged, one default) and backup landmarks.
- `src/data/sights.json`: Google sights per park (place ID, coordinates, mood tags), tagged in-park or nearby.
- `/api/place/[placeId]`: server route that looks up a sight's name live. It only accepts place IDs from our own list, so the key can't be misused.
- The map shows the outline, all entrances (tap one to start there) and sights (tap one for its name), with the OpenStreetMap credit.
- `geo.ts` helpers and data tests: entrances on the edge, one default, sights fresh within 30 days.
- **Acceptance:** all 12 parks show accurate outlines, entrances where Google Maps shows them, and the sights you'd expect (e.g. everything you circled in Central Park), with no restrooms, ball fields or rinks.

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

## Phase 2: Usability and Customize mode (your requests, 2026-10-07)

### M9. Sliding panel — *Medium*
- On phones, the panel becomes a real draggable sheet that follows your finger and snaps to one of three heights: **peek** (title bar only), **half** and **full**. A quick flick moves it one step.
- Tapping the header still toggles between peek and half. Desktop stays a sidebar.
- The map keeps its padding in step with the sheet, so the park and route stay visible above it.
- **Test:** drag up and down, flick, and tap on a phone-sized screen. Scrolling inside the full sheet must still work.

### M10. Bigger sight dots + photos — *Medium*
- Sight dots go from 10 px to about 18 px, each with an invisible 44 px tap area. Same for entrances.
- Tapping a sight shows its name, type and a **Google photo** with the required photographer credit.
- The server asks Google for the photo and only passes the browser a short-lived image link, so the key stays hidden.
- Photos are fetched live, which Google's terms allow; we never store them.
- **Cost:** about $0.007 per photo. I'll confirm the exact pricing and you set a daily cap in Google Cloud.
- The same photo also appears when you tap a stop in a finished walk.

### M11. Customize mode — *Hard*
- A switch at the top of the panel: **Surprise me** (today's mode) or **Customize**.
- **Picking sights:** in Customize, tap a sight dot or its popup's **Add** button to add it. Chosen sights turn into numbered pins and appear in a list, where each has a remove button. The limit is 10, Google's cheapest Routes tier.
- **Order:** Walkr arranges the picks into the shortest loop from your entrance (best order, no backtracking).
- **Live tracker:** shows the estimated time and distance, updated instantly and for free from straight-line distances times our measured detour factor. It's typically within about 10%.
- **Food stop:** an optional "Add a coffee stop / lunch spot" toggle. Walkr picks a well-rated place near the route, as it does today.
- **Build walk** asks Google for the real route and shows the usual results view with the exact time. **Edit picks** goes back to picking.
- **Test:** unit tests for ordering and the estimate. Then compare the estimate with Google's exact time on about 20 custom walks.

### M12. Security headers + ship v2.0 — *Easy*
- Standard security headers in `next.config.ts`: no framing by other sites, no MIME sniffing, a strict referrer policy and a locked-down permissions policy. Check that the map and photos still load.
- **You, in Google Cloud:** daily caps on the Routes, Maps JavaScript and photo APIs, plus a billing budget alert.
- Phone test on the live site, then tag and release **v2.0.0**.

---

## Phase 3: More ways to shape a walk, plus sharing (your choices, 2026-10-09)

### M13. Mood + refreshment — *Medium*
- **Mood** (Scenic, Quiet) and **refreshment** (None, ☕ Coffee, 🥪 Lunch, 🍰 Sweet treat) become two separate choices, so "Quiet + Coffee" is possible. One refreshment per walk.
- **Sweet treat** finds a well-rated bakery, ice cream or dessert shop near the route, the same way cafés are found today.
- **Customize mode** uses the same refreshment picker.
- The API takes `mood` + `refreshment`; old links that send `mood: "coffee"` keep working.
- **Test:** unit tests, then re-run the walk test script across all parks with each refreshment.

### M14. Extra stops: restroom, water, playground, dog run — *Medium*
- **"Add stops" toggles:** 🚻 Restroom, 💧 Water fountain, 🛝 Playground, 🐕 Dog run. More than one is allowed, within the 10-stop limit.
- **Data:** NYC Parks open data (restrooms, drinking fountains, playgrounds, dog runs), collected once and stored in the repo like the park outlines. Unlike Google data, it may be kept. I'll check each dataset's coverage before building.
- **Placement:** each stop goes where it adds the least walking. A note appears when none is nearby.
- Works in both Surprise me and Customize.

### M15. Route preferences: well lit, waterfront — *Medium–High*
- **💡 Well lit:** prefers sights and turning points on OpenStreetMap paths tagged lit. In Central Park, 1,647 path segments are tagged lit and 162 unlit; the rest aren't tagged. The result shows "≈ X% on lit paths".
- **Honest limits:** Google picks the exact path between stops, so lighting can't be guaranteed, and the app reminds walkers of park closing hours (e.g. Central Park is closed 1–6 AM).
- **🌊 Waterfront:** prefers stops near the water's edge (OpenStreetMap water outlines) and shows "≈ X% along the water". Most useful for Riverside, Brooklyn Bridge Park, the Battery and the Promenade.
- Both work by scoring candidate stops, plus measuring the finished route against the map data.
- **Test:** compare % lit and % waterfront with each preference on and off, across all parks.

### M16. Shareable links — *Low–Medium*
- **Share button:** copies a link that rebuilds the same walk for whoever opens it: park, entrance, stops in order, refreshment and preferences. Uses the phone's share sheet where available.
- Stop IDs are in the link, so it rebuilds the walk without re-planning (one Routes call).

### M17. AI walk description — *Low–Medium*
- **A short, fun write-up of each walk,** a few sentences mentioning the stops in order, from Claude Haiku 4.5 on the server.
- **Needs:** an Anthropic API key from you, stored on Vercel like the Google keys, plus a spending limit set in the Anthropic console.
- **Fallback:** if it fails, the walk shows without a write-up.

### M18. Save favorite walks — *Low*
- **⭐ Save** keeps a walk on this phone, using browser storage and the M16 link format. A "Saved walks" list opens or deletes them. No accounts.

### M19. "Good for" tags — *Medium*
- **Date, family or solo**, each nudging which stops are picked:
  - **Date:** views and fountains, with a sweet treat suggested.
  - **Family:** playgrounds and restrooms, building on M14.
  - **Solo:** quieter, well-lit paths.
- Defined once we see how M13–M15 feel.

### M20. Design polish + Add to Home Screen + ship v3.0 — *Medium*
- **Look:** branding (logo and colors), smoother animations and dark mode.
- **Add to Home Screen:** install Walkr like an app (PWA manifest and icons).
- Then a phone test, tag and release **v3.0.0**.

---

## Phase 4: Later ideas
| Feature | Notes |
|---|---|
| **Analytics** | Vercel Analytics plus custom events for park and mood; great for the presentation. |
| **Weather + golden hour** | Open-Meteo is free with no key and includes sunset times. |
| **Well lit / waterfront (retry)** | Tried in M15 and reverted. Lessons: OpenStreetMap lighting tags cover only 8–50% of paths near our parks; nudging sight choice moved "% lit" up in 9/12 parks but unevenly, and cost 3–8 Routes calls per walk. A better retry would steer the path itself (custom waypoints along lit paths) rather than the sights. |
| **Pace** | Stroll, normal or brisk, adjusting time estimates. |
| **More parks + "near me"** | E.g. Fort Tryon, Hudson River Park, Domino Park, plus a location prompt. |
| **Live GPS mode** | Your blue dot on the route while walking. |
| **Accessibility / step-free / terrain** | Avoid or warn about stairs (OpenStreetMap), plus hills (Elevation API). |
| **Shade** | Tree cover; data inside parks is limited. |
| **Skip cafés inside shops** | E.g. the café in Barnes & Noble that Coffee picked at Union Square. |
| **Full Content-Security-Policy** | Script-level policy; Google Maps needs many allowances. |

## How we'll work
- One milestone at a time. After each one: what changed, how to test with `npm run dev`, a commit with a clear message, and `PLAN.md` ticked.
- Anything that can't be done well in its phase moves to the next one.
- You do the Google Cloud, GitHub and Vercel account clicks. I give exact steps and run the CLI commands.

## Verification (overall)
- `npm run lint`, `npx tsc --noEmit` and `npx vitest run` pass at every commit.
- Scripted matrix at the end of M5: 12 parks × 4 moods × 2 lengths, checking distance accuracy and stop quality. Then spot-check on the map in M6–M7.
- Security checks: `git ls-files | grep env` shows only `.env.example`; the server key's text is absent from the `.next/static` build output; and the browser key fails when loaded from an unlisted domain.
- Final check on a real phone against the live Vercel URL.
