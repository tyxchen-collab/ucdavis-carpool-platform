# Davis Carpool — Phase 1

面向 UC Davis 中国留学生的中文拼车信息协调网站。Next.js App Router、TypeScript、Tailwind CSS；无数据库、无认证、无支付、无运输服务。

## Setup

Requires Node.js 22.18+ and npm (matching tests use native TypeScript support).

```sh
npm install
npm run dev
```

Open http://localhost:3000. To verify and run a production build:

```sh
npm test
npm run typecheck
npm run build
npm start
```

The committed package-lock.json pins the verified dependency tree. Use `npm ci` for repeatable installs. No environment variables are required.

## File structure

```text
src/
  app/
    layout.tsx          Shared navigation, footer, Chinese metadata
    globals.css         Tailwind import and responsive design styles
    page.tsx            Homepage
    not-found.tsx       Missing trip / route fallback
    trips/
      page.tsx          GET-based search and filtered mock listings
      [id]/page.tsx     Mock trip details, unknown IDs return 404
      new/page.tsx      Client validation and ephemeral form preview
    dashboard/page.tsx  Explicit user dashboard placeholder
  components/
    SearchForm.tsx      Shared departure / destination / date search
    TripCard.tsx        Shared mock trip summary
  lib/trips.ts          Typed mock fixture data and date formatting
```

## What works

- Responsive Chinese homepage, navigation and trip detail routes.
- Rule-based trip matching by route aliases, exact departure date, overlapping time windows and available seats. Search state stays in URL parameters; optional filters support browsing. Preview recommendations use the same matching function.
- Creation form checks required locations/name, distinct endpoints, valid future date/time in America/Los_Angeles, 1–6 companions, field lengths and demo acknowledgement. Inline errors are associated with inputs; the first invalid input receives focus.
- Valid submissions show a preview **only on the current page**. They are not persisted, published or added to search results. Refreshing clears the preview.

## Explicitly mocked / future work

All listings and users are fictional fixtures dated November 2026. They do not represent real availability. Dashboard is a placeholder. Joining trips is disabled. Email verification, accounts, chat, WeChat sharing, Supabase persistence and real publishing are not implemented. No personal data is sent to a backend.

The platform only helps students coordinate. Participants arrange their own licensed transportation and agree on costs themselves. It does not provide rides or collect payments. It is not affiliated with UC Davis.

## Vercel deployment

Push this directory as a repository, import it in Vercel, select the Next.js framework preset, and keep the default build command (`npm run build`). No secrets or database configuration are needed for Phase 1. This delivery has not been deployed to Vercel.

## Manual acceptance checks

Delivery verification: TypeScript (`tsc --noEmit`) and the Next.js production build passed. Browser/HTTP smoke checks were attempted but localhost connections timed out in the execution environment, so visual layout and interactive form behavior have not been browser-verified. The checks below remain manual acceptance steps.

1. At `/`, search `SFO`: the list shows compatible active fixtures; open its details and return.
2. Search a nonexistent location: an empty state offers a new preview. Clear filters to see upcoming active trips with available capacity.
3. Visit `/trips/unknown`: the missing-trip page returns a 404.
4. Submit `/trips/new` empty, with matching endpoints, or with a past date: clear errors appear. Complete a future trip and acknowledge the demo: a preview appears; refreshing removes it.
5. At narrow mobile widths, check navigation, single-column cards and form fields. Use Tab to check visible keyboard focus.
6. Dashboard and details label unavailable features; no joining, authentication or contact exchange occurs.

## Phase 1.2 matching rules

- `src/lib/matching.ts` is a pure matcher with an injectable clock for tests. Dates and current time use America/Los_Angeles. Cancelled, full, past, invalid and self trips are excluded. A same-day nominal departure at or before the current minute is past, even if its flexibility extends later.
- Origins and destinations must match exactly after trimming/case normalization, or belong to a known city/airport alias group. Different locations within Davis may match with a lower score and a meeting-point explanation. Airports and city centers are separate groups. Unknown locations require exact matching; this is not geocoding.
- Departure dates must be identical when specified. Time windows overlap inclusively using both trips' flexibility; windows are clipped to that departure day and future minutes. Time filtering requires a date.
- `traveling` includes the organizer. Candidate `availableSeats` must accommodate the entire party. Existing `seats` still describes additional companions requested, not total vehicle capacity. Luggage remains visible in the preview but is not a matching constraint.
- Score weights: origin 30, destination 30, date 20, time 15, capacity 5. Exact locations receive 30; aliases receive 25. Time points decrease linearly from 15 at equal departure times to 0 at the overlap boundary. Compatible capacity receives 5. Unspecified criteria are excluded from the denominator; the result is rounded to 0–100. Ties sort by date, time, then ID. A score is compatibility with supplied filters, not a booking guarantee.
- Mock examples: Davis → SFO, 2026-11-20, 09:00 ±30 minutes, party of 1 or 2 produces two recommendations. Cancelled, full and old fixtures never appear as recommendations. Fixtures eventually expire as real time advances.
- Run `npm test` for deterministic matching tests. If the environment's Turbopack CSS subprocess fails, run `npm run build -- --webpack` without changing project configuration.
