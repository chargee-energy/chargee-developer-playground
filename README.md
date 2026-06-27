# Chargee Developer Playground

A beautiful, branded play-interface to the **Ampere API**. It lets customers
explore their energy data — groups, addresses, devices, telemetry, schedules and
flex — **without writing a frontend**, and shows the exact request, raw JSON
response and a link to the API docs behind every screen.

The API client is **generated from the live OpenAPI spec**, so the UI stays in
lock-step with the API: regenerate, and `typecheck`/`lint` immediately flag any
request that no longer matches the contract.

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS** with the Chargee brand tokens (shared with `chargee-curtailer-frontend`)
- **TanStack Query** for server state · **Zustand** for auth / selection / inspector state
- **Headless UI + Heroicons** · **Recharts** for telemetry · **react-hook-form + Zod**
- **react-i18next** (English + Dutch)
- **orval** — generates a typed axios client + React Query hooks from `openapi.json`

## Getting started

```bash
cp .env.example .env      # defaults point at the prod Ampere API
npm install
npm run dev               # http://localhost:5173
```

Sign in with your Ampere account. If your user has a single group it is selected
automatically; otherwise pick a group → address from the top bar.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_AMPERE_API_URL` | API **origin** (no `/api/v2` suffix — the generated paths already include it). |
| `VITE_AMPERE_DOCS_URL` | Swagger UI base used for "View in API docs" deep links. |

## Keeping in sync with the API

The whole client is generated. When the API changes:

```bash
npm run api:sync          # pull the latest spec + regenerate client & endpoint registry
npm run typecheck         # any broken request/field/param surfaces here
```

- `npm run api:pull` — fetch the live spec into `openapi.json`.
- `npm run api:generate` — run orval into `src/api/generated/` and rebuild
  `src/api/endpoints.generated.ts` (the endpoint registry powering doc links).

CI (`.github/workflows/ci.yml`) regenerates from the committed spec and fails the
build if the checked-in client has drifted, then runs typecheck, lint and build.

## How it's organised

```
src/
  api/         mutator.ts (axios + auth/refresh + inspector capture)
               endpoints.ts (doc-link registry) · generated/ (orval output)
  store/       auth · context (group/address, URL-synced) · inspector (raw calls)
  components/  layout/ (shell + group/address ContextBar) · common/ (JsonViewer,
               ApiInspector, DataTable, ConfirmDialog, …) · PageHeader
  features/    auth · dashboard · addresses · devices · telemetry · schedules ·
               flex · console · whats-new
  locales/     en · nl
```

### Signature feature: Raw + Docs

Every `PageHeader` has a **Raw + Docs** button that opens the **API Inspector**: a
slide-over showing the exact request, status, timing, the raw JSON response
(collapsible tree), a **Copy as cURL** snippet, and a **View in API docs** deep
link. Every request made by the app is captured automatically by an axios
interceptor. The **API Console** (`/console`) lets you fire any endpoint directly.

## Build

```bash
npm run build     # tsc -b && vite build → dist/
npm start         # serve the built dist/ as a SPA (uses $PORT, default 3000)
```

`VITE_*` values are **compiled into the bundle at build time**, so they must be
present when `npm run build` runs (not just at runtime).

## Deploy to Heroku

The app is a static SPA served by [`serve`](https://www.npmjs.com/package/serve)
on the `heroku/nodejs` buildpack:

- **Build** — Heroku runs `heroku-postbuild` (`npm run build`) → `dist/`.
- **Run** — the `Procfile` serves it: `web: npx serve -s dist -l $PORT --single`
  (`-s/--single` rewrites unknown routes to `index.html` for client-side routing).
- `serve` is a runtime dependency so it survives dev-dependency pruning.
- `engines.node` pins Node 22.

Provision and configure (one-time):

```bash
heroku create chargee-developer-playground
heroku buildpacks:set heroku/nodejs

# Build-time config — Heroku exposes config vars to the build, so these are
# compiled into the bundle. Set them BEFORE deploying.
heroku config:set VITE_AMPERE_API_URL=https://ampere.prod.thunder.chargee.io
heroku config:set VITE_AMPERE_DOCS_URL=https://ampere.prod.thunder.chargee.io/api/v2

git push heroku main
```

`app.json` declares the buildpack and these env vars (handy for review apps /
"Deploy to Heroku"). After changing a `VITE_*` config var you must **rebuild**
(redeploy) for it to take effect, since the value is baked into the bundle.

> The browser talks to the Ampere API directly, so the API must allow CORS from
> the app's origin. No reverse proxy is configured.

## Deploy with Docker (alternative)

```bash
docker compose up --build     # static SPA on http://localhost:3600
```

Override the compiled API origin/docs URL with
`--build-arg VITE_AMPERE_API_URL=…` (see `Dockerfile`).

## Notes

- Auth tokens are stored in `localStorage`; 401s trigger a single
  `/auth/refresh` + retry before redirecting to login. Logout calls `/auth/logout`.
- Solar-inverter schedules have **no update operation** in the API — edit by
  deleting and recreating (the UI reflects this).
