# Handoff — University Lab & Equipment Booking System

**Written:** 2026-10-01
**Plan of record:** `docs/plans/wiggly-exploring-popcorn.md` (also at `~/.claude/plans/wiggly-exploring-popcorn.md`)
**Design ref:** `docs/design-reference.md`

---

## Read this first — one blocker, two conflicts

### 1. BLOCKER: env var name mismatch (wrong key silently blank)

`.env` defines:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   <-- name
SUPABASE_SERVICE_ROLE_KEY
```

Every file I wrote reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` — a name that does not exist in `.env`.

Supabase renamed the dashboard label from "anon key" to "publishable key". The *value* is almost certainly the correct client-safe key; only the name differs. But as written, `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` is `undefined`, so `createClient()` throws the missing-env error on every page.

**Fix — pick one, then do nothing else:**

```bash
# Option A: rename in .env (one line, no code changes)
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same value as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>

# Option B: update the three reader files to the new name
#   src/lib/supabase/client.ts     (line with process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
#   src/lib/supabase/server.ts     (same)
#   src/proxy.ts                   (same)
# plus .env.example
```

Recommend **Option A** — fewer files touched, and the old name still works everywhere.

Verify by starting the dev server and loading `/login`. If it renders without the missing-env error, the key resolved.

### 2. CONFLICT: charting / QR dependencies are not installed

`docs/design-reference.md` specifies **Tremor/Recharts**. Neither is installed. `qrcode` is also **not installed** (`node_modules/qrcode` does not exist), and my plan assumed it would be.

My plan explicitly said the analytics heatmap would be "pure CSS grid, no logic risk" and that adding a QR dep was "the cheaper call". Neither has happened yet — nothing is broken, but the decision is unmade.

Before building `/analytics` or `/scan`, run:

```bash
npm install recharts
npm install qrcode
```

`recharts` needs a `'use client'` wrapper component — it cannot render from a Server Component. `qrcode` is server-safe; generate the SVG data URL server-side and pass it down as a string.

If the clock is tight, the CSS-grid heatmap needs no dependency at all and is still worth building.

### 3. CONFLICT: role model differs from the rulebook

`docs/design-reference.md` says **"Roles: student, faculty, lab staff, admin"** — four roles, no coordinator.

The rulebook (`docs/rulebook.md` §2) defines **five**: Student/Faculty Member, Lab Staff/Lab Incharge, Department Coordinator, Administrator.

The database enum and all RLS policies are built for **five**:

```
user_role: student | faculty | lab_staff | coordinator | admin
```

Recommendation: **keep five.** Dropping `coordinator` means editing `0001_schema.sql`, every policy in `0002_rls.sql`, `src/lib/types.ts`, and `src/lib/auth.ts` — and loses the "Manage department labs / Define booking rules" capabilities the rulebook asks for. Give `coordinator` and `admin` the same UI treatment (both are "lean" per the approved plan), which satisfies the design ref's four-role nav without a schema change.

The seed script creates accounts for all five.

---

## What is DONE and verified

Everything below typechecks clean (`npx tsc --noEmit` → no output). **Nothing has been run against the database yet** — no migration has been applied and the seed script has never executed.

### Database — `supabase/migrations/` (4 files)

Paste into the Supabase SQL Editor **in this order**. Not yet applied.

| File | Contents |
|---|---|
| `0001_schema.sql` | 9 enums, 11 tables, `equipment_availability` view, `updated_at` triggers, `handle_new_user` trigger |
| `0002_rls.sql` | RLS on every table, `auth_role()`/`is_staff()`/`is_coordinator()`/`is_admin()`/`can_manage_lab()` SECURITY DEFINER helpers, `notify_user()` RPC, `prevent_self_role_change` trigger |
| `0003_conflict_guard.sql` | `btree_gist`, `bookings_no_lab_overlap` EXCLUDE constraint, equipment availability triggers, `is_conflict_error()` helper |
| `0004_seed_reference.sql` | 4 departments, 8 labs, 11 equipment categories, 25 equipment rows, 4 booking-rule rows |

Key design decisions a new reader must not undo:

- **`equipment.available_quantity` is deliberately NOT a column.** It is derived in the `equipment_availability` view. A stored counter drifts on concurrent bookings.
- **`handle_new_user` always sets role `'student'`**, never reading role from signup metadata — otherwise anyone could self-register as admin.
- **Self-update of `profiles` cannot change `role`/`is_active`/`department_id`** — a trigger reverts those.
- **The EXCLUDE constraint only covers statuses `approved, reserved, in_use, overdue`.** Drafts, pending and rejected bookings do not block a slot. If a new active status is added, the constraint, the `isActive()` helper in `status.ts`, and the `equipment_availability` view must all be updated together.
- `equipment_availability` has `security_invoker = true` — without it the view would bypass RLS and expose every row.

### Booking engine — `src/lib/booking/` (5 files, pure functions, no Supabase import)

| File | Exports |
|---|---|
| `status.ts` | `BookingStatus`, `BOOKING_STATUSES`, `canTransition`, `assertTransition`, `IllegalTransitionError`, `isActive`, `isTerminal`, `isPending`, `STATUS_LABELS`, `STATUS_TONES` |
| `availability.ts` | `windowsOverlap`, `findConflicts`, `findAlternativeSlots`, `findAlternativeLabs`, `checkLabs`, `toMinutes`, `fromMinutes`, `durationMinutes`, `addDays`, `daysBetween` |
| `rules.ts` | `evaluateRules`, `RuleContext`, `RuleOutcome`, `isWithinOpeningHours`, `formatDuration`, `LATE_RETURN_THRESHOLD` |
| `recommend.ts` | `recommendLabs`, `scoreLab`, `Recommendation`, `suggestQuantity` |
| `priority.ts` | `scorePriority`, `Priority`, `PRIORITY_LABELS` |

**Windows are half-open, `[start, end)`.** A booking ending 11:00 does not conflict with one starting 11:00. This matches the Postgres `tsrange` default used by the EXCLUDE constraint. **App and database must agree on this** — if you change one, change both.

### Foundation

| File | Purpose |
|---|---|
| `src/lib/types.ts` | Hand-written `Database` type (no `supabase gen types` — CLI unavailable). **Must be updated by hand whenever a migration changes a column.** |
| `src/lib/supabase/client.ts` | `createClient()` for Client Components |
| `src/lib/supabase/server.ts` | `createClient()` async, per-request, `getAll`/`setAll`, `setAll` wrapped in try/catch |
| `src/lib/auth.ts` | `getCurrentProfile`, `requireUser`, `requireRole`, `assertRole`, `STAFF_ROLES`, `COORDINATOR_ROLES`, `AuthorizationError` |
| `src/proxy.ts` | Session refresh + redirect. **`src/proxy.ts`, NOT `middleware.ts`** |
| `scripts/seed-users.ts` | 8 auth users via Admin API + ~400 historical bookings + 5 live bookings + issued equipment |
| `.env.example` | Template (says `ANON_KEY` — see blocker #1) |

### UI

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | ThemeProvider + Toaster, real metadata, `suppressHydrationWarning` |
| `src/app/page.tsx` | Public landing page — hero, workflow strip, feature grid, role cards, CTA |
| `src/components/theme-provider.tsx` | next-themes wrapper, `attribute="class"` |
| `src/components/status-badge.tsx` | `StatusBadge`, `ApprovalBadge`, `ToneBadge`, tone maps, `titleCase` |
| `src/components/stat-card.tsx` | KPI tile |
| `src/components/empty-state.tsx` | Empty state with optional action |
| `src/components/page-header.tsx` | `PageHeader`, `PageBody` |

---

## Next.js 16 facts that will bite (verified against bundled docs, not memory)

Read `node_modules/next/dist/docs/` before writing code — `AGENTS.md` requires it.

- **Cache Components is opt-in.** `cacheComponents` is absent from `next.config.ts` and **must stay absent**. Do not use `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`. Supabase calls are not `fetch`, so they are not cached. Use `revalidatePath()` after mutations.
- **`middleware.ts` no longer exists** → `src/proxy.ts`, exporting `proxy` (or default). Runtime is nodejs, unconfigurable.
- **`params`, `searchParams`, `cookies()`, `headers()` are async only.** Use `PageProps<'/route'>`, `LayoutProps<'/'>`, `RouteContext<'/api/x/[id]'>` — globals, generated by `next dev`/`next build`/`next typegen`.
- **`next lint` is removed.** Use `npm run lint` (ESLint CLI).
- **Turbopack is default** for dev and build. `next dev` writes to `.next/dev`.
- **Server Functions are reachable by direct POST.** Every action must call `assertRole()` itself. The proxy redirect is convenience only, never a security boundary.
- Per `@supabase/ssr` 0.12.7: `get`/`set`/`remove` cookie methods are **deprecated** — use `getAll`/`setAll`. `setAll` receives `(cookiesToSet, headers)`; those headers **must** be written to the response or a CDN can cache one user's session token and serve it to another. `src/proxy.ts` already does this.

---

## UI kit facts

- Components wrap **Base UI** (`@base-ui/react@1.8.0`), **not Radix**. Use the `render` prop, **not** `asChild`:
  ```tsx
  <Button render={<Link href="/login" />}>Sign in</Button>
  ```
- `cn` comes from the `cn` package, re-exported via `src/lib/utils.ts`: `import { cn } from "@/lib/utils"`.
- Already wrapped in `src/components/ui/`: Button, Card, Input, Label, Textarea, Badge, Tabs, Sheet, DropdownMenu, Avatar, Separator, Skeleton, Sonner.
- Available but **unwrapped** in `node_modules/@base-ui/react/`: `select`, `dialog`, `alert-dialog`, `progress`, `checkbox`, `switch`, `field`, `popover`, `tooltip`. Wrap only what you use.
- `Badge` has variants `default | secondary | destructive | outline | ghost | link` — **no success/warning**. That is why `status-badge.tsx` uses its own tone map instead.
- Design tokens live in `src/app/globals.css`: `--primary`, `--muted`, `--destructive`, `--chart-1..5`, `--radius-*`. Dark mode is class-based (`.dark` at line ~86).

---

## Where I stopped

Last completed action: wrote `src/app/page.tsx` (landing page), ran `npx tsc --noEmit` → clean. `TaskUpdate` for task #5 ("design system") was set `in_progress` but **the design system is effectively finished** — theme provider, status badge, stat card, empty state, page header all written and typechecking.

I was about to start the **app shell** (`(app)` route group, sidebar, dashboard) when the session handed off.

---

## Remaining work, in dependency order

Tasks #5–#10 exist in the task list. Status:

**#5 design system — DONE** (mark complete; may want more components as pages are built)
**#6 landing + auth — landing DONE, auth pages NOT STARTED**
**#7 app shell + dashboard — NOT STARTED**
**#8 Server Actions — NOT STARTED**
**#9 booking/browse flows — NOT STARTED**
**#10 issues desk, QR, waitlist, analytics — NOT STARTED**

Recommended order:

1. **Fix blocker #1** (env var name) and paste the four migrations. Nothing else works until the DB exists.
2. **Run `npm run seed`** — creates demo accounts and the booking history the analytics read from. Without it every chart is empty.
3. **Task #8 — Server Actions** (`src/lib/actions/`): `bookings.ts`, `approvals.ts`, `issues.ts`, `waitlist.ts`, `admin.ts`. Do this **before** the UI that calls it. Every action starts with `assertRole()`. Catch the EXCLUDE violation and map it through `is_conflict_error()` to a human message — otherwise a race shows the user raw Postgres text.
4. **Tasks #6 + #7 — auth pages, app shell, dashboard.** Login must carry demo-account quick-login buttons (non-interactive, one per role) so judges get in instantly.
5. **Task #9 — booking wizard** at `(app)/bookings/new`. This is the demo centrepiece: pick resource → date/time → availability check → rule check → smart alternatives on conflict → submit.
6. **Task #10 — issues desk, QR, waitlist, analytics.**

Per the design ref: booking flow Cal.com-like, availability a Skedda-style timeline grid (rows = labs, columns = time), approval queue Linear/Ramp-inbox-like, analytics Stripe/Vercel dashboard-like.

---

## Verification — nothing below has been run yet

1. `npm run dev`, load `/login` — no missing-env error.
2. Paste migrations in order into the Supabase SQL Editor. All four must succeed.
3. `npm run seed` → prints demo accounts, all password `hackathon123`:
   `student@lab.edu`, `faculty@lab.edu`, `staff@lab.edu`, `coordinator@lab.edu`, `admin@lab.edu`, plus `sara@lab.edu`, `usman@lab.edu`, `ee.staff@lab.edu`.
4. Log in as `student@lab.edu`. Browse labs, open a detail page.
5. Request the same slot twice for one lab — second attempt must show a conflict **and** ranked alternatives with match percentages.
6. Request more equipment units than available — refused, with the actual available count.
7. Log in as `staff@lab.edu`. The pending request appears in the approvals queue with a priority badge. Approve it.
8. Issue the equipment. Confirm the QR renders and manual code resolves.
9. Return with a damage report + image. Status → `damaged`, `damage_count` increments.
10. Force an overdue issue; confirm it appears in the overdue list.
11. Confirm `equipment_availability` reflects new counts and a cancelled booking releases its slot.
12. Join a waitlist on a fully-booked slot, cancel someone's booking, confirm promotion fires and writes a notification row.
13. Open analytics as `coordinator@lab.edu` — heatmap, peak hours, most-booked labs, damage reports all populated from seeded history.
14. **Security check:** as a student, POST directly to an approve action. Must be rejected server-side.
15. `npm run lint` and `npm run build` clean.

---

## Open questions for the user

1. **Coordinator role** — keep it (recommended, matches rulebook + schema) or drop to four roles per the design ref?
2. **Charts** — install `recharts`, or build the heatmap in pure CSS (no dependency, still effective)?
3. **QR generation** — install `qrcode`, or hand-roll an encoder?
4. **Budget check** — the original plan was scoped to 4 hours. Tasks #6–#10 plus the app shell are substantially more than what remains of that. Worth confirming what to cut if the clock is short. My recommended cut order, cheapest first: waitlist → QR camera scan (manual code only) → analytics depth.
