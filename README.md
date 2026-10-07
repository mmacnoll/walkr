# Walkr

**Loop walks through New York City parks.** Pick a park, a starting entrance, how long you want to walk and a mood. Walkr draws a loop that starts and ends at your entrance, passes interesting stops along the way and lists them in order.

Live app: **https://walkr-gamma.vercel.app**

## Features
- **12 NYC parks:** Central Park, Riverside, Morningside, Prospect, Madison Square, Union Square, Washington Square, the High Line, the Battery, Brooklyn Heights Promenade, Brooklyn Bridge Park and Walt Whitman Park.
- **Real entrances** from OpenStreetMap, with a sensible default for each park.
- **Length in minutes or miles** (about 20 minutes per mile).
- **Four moods:**
  - **Scenic:** landmarks, views, fountains and sculptures.
  - **Quiet:** gardens and calmer corners, away from busy plazas.
  - **Coffee Stop:** a well-rated café on the way, found live.
  - **Lunch Spot:** a well-rated restaurant on the way, found live.
- **Customize mode:** pick your own sights on the map. Walkr puts them in the shortest loop, shows a live time estimate as you pick, and can add a café or lunch stop.
- **Photos:** tap any sight or stop to see a Google photo of it.
- **Numbered stops** on the map and in a list. Tap one to see where it is.
- **Try another:** builds a different loop with the same settings.
- **Works on a phone**, with friendly messages when something goes wrong (offline, slow connection, daily limits).

## How it works
1. Each park has a list of sights, collected from Google Places ahead of time.
2. When you ask for a walk, the server picks sights that match your mood and fit your length, and orders them into a loop around your entrance.
3. Google's Routes API turns that loop into real walking paths. If the walk comes out too long or too short, Walkr adjusts the loop and tries again, up to 4 times.
4. For Coffee and Lunch, it searches live for a well-rated place near the loop and adds it as a stop.

Google API keys stay on the server, except the map display key, which is locked to this site.

## Tech
Next.js (App Router), TypeScript, Tailwind CSS, `@vis.gl/react-google-maps`, Google Maps JavaScript, Places (New) and Routes APIs, Vitest. Hosted on Vercel.

## Run it locally
You need Node 24 and a Google Cloud project with billing turned on.

1. Install:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in:
   | Variable | What it is |
   |---|---|
   | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Browser key. Maps JavaScript API only, restricted to your site addresses. |
   | `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Map ID from Google Cloud → Map Management. |
   | `GOOGLE_MAPS_SERVER_KEY` | Server key. Places API (New) and Routes API only. Never sent to the browser. |
3. Start the app, then open http://localhost:3000:
   ```bash
   npm run dev
   ```
   On Windows, if PowerShell blocks `npm`, use `npm.cmd run dev`.

## Useful commands
| Command | What it does |
|---|---|
| `npm test` | Runs the automated tests. They never call Google. |
| `npm run lint` | Checks the code style. |
| `npm run refresh:sights` | Re-collects park sights from Google Places, about 400–500 searches. **Run at least every 30 days:** Google's terms only allow storing place locations for 30 days, and a test will remind you. |
| `node scripts/custom-matrix.mjs` | With the dev server running, builds sample Customize walks in every park and checks the live estimate against Google's real times. |
| `npm run refresh:osm` | Re-collects park outlines and entrances from OpenStreetMap. |

## Data and attribution
- Map, places and routes © Google.
- Park outlines and entrances © OpenStreetMap contributors, under the ODbL.
- Walkr stores only Google place IDs, coordinates and its own mood tags. Names are looked up live when a walk is built.

## About
Built for a vibe-coding class at Columbia Business School, with Claude Code.
