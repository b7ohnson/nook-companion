# NooK

Family hub: a wall-mounted display + a phone companion app, sharing one
Firebase project. **Two independent git repos**, no monorepo tooling, plus
one small shared package:

- `~/skylight-calendar` (this repo) — GitHub `b7ohnson/nook-display`, the
  wall display, package name `skylight-calendar` (legacy, predates the
  "NooK" rebrand — leave it as-is).
- `~/skylight-companion` — GitHub `b7ohnson/nook-companion`, the phone PWA.
- `~/nook-core` — GitHub `b7ohnson/nook-core` (private), logic both apps
  must agree on. Pure functions and constants; no React, no Firebase SDK.
  Consumed by both apps as `github:b7ohnson/nook-core#v1`, a pinned tag —
  changing it means pushing a new tag and bumping the ref in both
  `package.json` files, which is deliberate: a silent floating update
  across two apps that share a database is the failure this package exists
  to prevent.

`nook-core` holds the chore-recurrence math (`nook-core/recurrence`),
Firestore paths (`nook-core/paths`), and the room TTL and player cap
(`nook-core/constants`). Use these instead of re-deriving date boundaries
or writing `doc(db, 'skylight', 'tasks')` by hand — the recurrence math
previously existed in both repos and drifted, leaving the display resetting
weekly chores on Monday and the companion on Sunday against the same
document.

The **hooks themselves stay per-repo on purpose.** Several look duplicated
but are a deliberate read-only/read-write split: the display's `useGallery`
is 23 lines of slideshow against the companion's 81 lines of upload
handling, and `useGameRoom` exposes the full set of game-driving mutators
in the display versus only `addPlayer`/`updatePlayer` in the companion.
Don't merge those. `useGoogleCalendar` is display-only. When a hook in one
repo genuinely needs a behavior change that the other shares, the logic
belongs in `nook-core`, not copy-pasted.

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
- **Firebase Storage** — gallery photo files, under `gallery/**` (family
  accounts only, images under 15 MB — see `storage.rules`; the apps show
  photos through tokenised download URLs, which bypass the rules).
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
  expires 2h after `createdAt`), `scores` (leaderboard, ordered by score
  desc), `gameContent` (riddles/trivia/would-you-rather/heads-up/Family
  Feud/Jeopardy seed content).

`firestore.rules` (this repo only — the companion deploys hosting only)
deliberately has **no `/{document=**}` catch-all**. That recursive wildcard
also matches `gameRooms/{roomCode}`, and since Firestore grants access when
any matching rule allows, it silently gave every signed-in user unrestricted
write access to game rooms. Each collection is listed explicitly instead, so
**a new collection needs a new rule** or it is denied by default.

Game rooms are readable by anyone (players join unauthenticated via QR) but
writes are scoped: anonymous callers may change `players` and the five
buzz/answer keys of `payload` (`buzzedBy`, `buzzersOpen` — closing only —
`submittedAnswer`, `fmSubmit`, `fmDuplicate`), and only before the room
expires; creating, `state` and other `payload` writes, and deletes require
a family account. A single room is publicly gettable; listing rooms is not.

**Family accounts:** every other rule checks `isFamily()`, a fixed list of
Firebase Auth uids in both `firestore.rules` and `storage.rules` (uids, not
emails, because the repo is public). Any Google account can sign in, but
only listed uids can read or write family data. Adding a person means
adding their uid to both files and deploying.

The 2h TTL and the 16-player cap are enforced in the rules and
mirrored in `nook-core/constants` — rules can't import, so changing either
means changing both.

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
