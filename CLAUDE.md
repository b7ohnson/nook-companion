# NooK

Family hub: a wall-mounted display + a phone companion app, sharing one
Firebase project. **Two independent git repos**, no shared package or
monorepo tooling:

- `~/skylight-calendar` (this repo) — GitHub `b7ohnson/nook-display`, the
  wall display, package name `skylight-calendar` (legacy, predates the
  "NooK" rebrand — leave it as-is).
- `~/skylight-companion` — GitHub `b7ohnson/nook-companion`, the phone PWA.

Several hooks (`useTasks`, `useGroceries`, `useGameRoom`, `useGallery`,
`useGoogleCalendar`, `useNotifications`, `useAuth`, `useDarkMode`) are
**duplicated verbatim between the two repos** — a schema or contract
change in one needs the matching change in the other, made and reviewed
separately since there's no shared code to catch it automatically.

## This repo (nook-display)

`npm run dev` (Vite). Panels: calendar (`WeekView`, `MiniCalendar`,
`EventList`, `EventModal`), tasks/chores, groceries, meal planner, weather,
news, sports, photo slideshow (idle-triggered after ~2 min, backed by
`useGallery`), and party games in `src/components/games/` (Tetris, Heads
Up, Trivia, Trivia Showdown, Would You Rather, Daily Riddles, Family Feud,
Jeopardy — all sharing a `GamePanel` header/chrome component).

## Companion repo (nook-companion)

`npm run dev -- --port 5174`. Tabs: Home, Tasks, Groceries, Calendar,
Gallery. Also has unauthenticated routes `/play/:roomCode` and
`/play/headsup/:roomCode` for joining a game session on the display via QR
code. Has a service worker (`sw.js`, Workbox via `vite-plugin-pwa`) for
offline shell + push notifications — the display app has neither.

Both deploy to Firebase Hosting from their own `firebase.json`/
`.firebaserc`, same Firebase project.

## Backend: Firebase only — no server

There is **no Express/Next.js API, no PostgreSQL, and no iCloud/CalDAV
integration** anywhere in either repo. The entire backend surface is:

- **Firestore** — data storage, read via `onSnapshot`/`getDocs`.
- **Firebase Storage** — gallery photo files, under `gallery/**` (public
  read, authenticated write — see `storage.rules` in this repo).
- **Firebase Auth** — `GoogleAuthProvider` + `signInWithPopup`, single
  Google account per device/session (`useAuth.js`, nearly identical copy
  in both repos).
- **Google Calendar** — accessed directly from the client via Google
  Identity Services OAuth (`useGoogleCalendar.js`, this repo only). No
  server-side token handling; access tokens live in
  `sessionStorage`/`localStorage` only. `App.jsx` runs one hook instance
  per family member (e.g. `'blessing'`, `'pearl'`), each its own
  independent OAuth connection. Event IDs are compound strings
  `storageKey::calendarId::eventId` — preserve that format.
- A few hooks bypass Firestore entirely and hit public third-party APIs
  directly: `useSports` (ESPN), `useNews` (`api.rss2json.com` over NPR
  RSS), `useWeather` (Open-Meteo).

Don't assume a server, a database beyond Firestore, or CalDAV exist when
picking up a task — if one seems to be needed, that's a real architecture
question to raise, not something to build silently.

Real credentials live in `.env.local` (gitignored, not committed) in each
repo — Firebase config + `VITE_GOOGLE_CLIENT_ID`. Never log, print, or
commit these values.

## Firestore data model

- **Single shared docs** under a `skylight` collection (legacy name, keep
  it): `skylight/tasks` (chores keyed by person, arrays of
  `{id, task, done}`), `skylight/groceries` (`{items: [{id, name, done}]}`),
  `skylight/meals` (date-keyed map of meal slots), `skylight/gallery`
  (`{photos: [...]}`, image files themselves live in Storage, not here).
  Seed from local mock data (`data/mockData.js`, `data/gameContentSeed.js`,
  `data/familyFeudSeed.js`, `data/jeopardySeed.js`) when empty.
- **Real collections**: `gameRooms/{roomCode}` (multiplayer session state,
  auto-expires ~2h), `scores` (leaderboard, ordered by score desc),
  `gameContent` (riddles/trivia/would-you-rather/heads-up/Family
  Feud/Jeopardy seed content).

Each domain is wrapped in one `use*` hook per repo, following a consistent
shape: local `useState`, a Firestore subscription in `useEffect`, and
`setDoc`/`updateDoc`/`addDoc` mutators returned alongside the data.

## "Family members" aren't a real identity model

There's no per-person Firestore identity. Blessing/Pearl exist only as
hardcoded keys (in `useTasks`/`useNotifications`, and as two separate
`useGoogleCalendar` connections) and as a fallback array in
`data/mockData.js` (used for the calendar legend when no Google account is
connected). Event/calendar color is actually per-Google-*calendar*
(`cal.backgroundColor`), not per-person — one person with multiple Google
calendars shows multiple colors. `useAuth`'s signed-in Firebase user is
unrelated to this distinction (single-account auth per device, not
per-family-member).

## Conventions

- Components: flat `src/components/` (plus `games/` in nook-display),
  PascalCase `.jsx`, no barrel files.
- Hooks: flat `src/hooks/`, camelCase `use*.js`, one per data domain.
- State: local React hooks only — no Redux, no Context API. Data flows
  top-down via props from `App.jsx`. Callback props are named `onXxx`.
- Styling: plain global CSS per repo (`App.css`/`index.css`), no CSS
  Modules, no Tailwind. BEM-ish kebab-case classes with a component
  prefix and `--modifier` suffix (`wv-evt--today`, `page-tab--active`).
  Design tokens as CSS custom properties on `:root` (`--bg`, `--surface`,
  `--text`, `--accent`, `--radius`, `--font`, etc.), dark mode via a
  `[data-theme="dark"]` override toggled by `useDarkMode`
  (`data-theme` attribute + localStorage). The companion repo adds
  `--green` and `--safe-bottom` (iOS safe-area) tokens. Dynamic/data-driven
  values (event colors, computed positions) use inline `style`; static
  styling stays in CSS classes.
- Games share a `GamePanel` wrapper for header chrome (title/score/status/
  restart/exit); `Trivia`/`TriviaShowdown` use `weeklyShuffled()`
  (`src/utils/weeklyRotation.js`) to deterministically rotate their
  question pool once per ISO week.
- The display app is kiosk-style: `touchstart` resets an idle timer that
  triggers the photo slideshow after ~2 min. No swipe/gesture library is
  used anywhere; `WeekView` drag-to-reschedule uses HTML5 drag-and-drop,
  not touch gestures.

## Subagents

`.claude/agents/` (present in both repos, kept in sync) has three agents
for ongoing work: `frontend-developer` (React/UI), `backend-developer`
(Firestore/Storage/auth/Google Calendar), and `qa-tester` (exercises the
app as an end user, reports back to whichever developer agent owns the
affected area). Their system prompts have more detail than this file on
their respective areas.
