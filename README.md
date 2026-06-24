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
               flex · console
  locales/     en · nl
```

### Signature feature: Raw + Docs

Every `PageHeader` has a **Raw + Docs** button that opens the **API Inspector**: a
slide-over showing the exact request, status, timing, the raw JSON response
(collapsible tree), a **Copy as cURL** snippet, and a **View in API docs** deep
link. Every request made by the app is captured automatically by an axios
interceptor. The **API Console** (`/console`) lets you fire any endpoint directly.

## Build & deploy

```bash
npm run build                 # tsc + vite build → dist/
docker compose up --build     # static SPA on http://localhost:3600
```

The API origin/docs URL are compiled in at build time — override with
`--build-arg VITE_AMPERE_API_URL=…` (see `Dockerfile`).

## Notes

- Auth tokens are stored in `localStorage`; 401s trigger a single
  `/auth/refresh` + retry before redirecting to login. Logout calls `/auth/logout`.
- Solar-inverter schedules have **no update operation** in the API — edit by
  deleting and recreating (the UI reflects this).
