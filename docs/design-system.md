# Lab Reserve — Design System & Rebrand Plan

**Status:** Phase 0 (audit + tokens). This document is the single source of truth for the UI rebrand.
**Scope:** visual layer only. Routes, server actions, data models, RLS, and the booking engine (`src/lib/booking/*`) must not change behaviour.
**Source brief:** the rebrand task spec (kept in the session); `docs/design-reference.md` remains the product look-and-feel reference.

---

## 1. Audit — what is weak today

### 1.1 Tokens & theme
| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | No brand colour. `--primary` is near-black `oklch(0.205 0 0)`; the app renders monochrome. The only indigo in the codebase is an unused dark-sidebar token. | `src/app/globals.css` | Indigo `#4F46E5` as the single accent, with hover `#4338CA` and subtle bg `#EEF2FF`. |
| 2 | Default shadcn dark-grey palette; no slate system. Page bg is white, surfaces white, elevation is a hairline `ring-foreground/10`. | `globals.css`, `card.tsx` | Slate scale: bg `#F8FAFC`, surface `#FFFFFF`, border `#E2E8F0`, text `#0F172A`, muted `#64748B`; soft layered shadows. |
| 3 | **Font bug:** `--font-sans: var(--font-sans)` is self-referential, so Geist never applies (falls back to system sans). | `globals.css` `@theme inline` | `--font-sans: var(--font-geist-sans)`. Keep Geist (brief allows Inter *or* Geist — no new dependency). |
| 4 | Focus ring is neutral grey → keyboard focus is invisible against grey UI. | `--ring` | Indigo ring (`indigo-500`, `indigo-400` dark), used at `/50` opacity. |
| 5 | No status tokens. Status colours are hardcoded per file (`blue-500` here, `red-500` there, `emerald-600/text-emerald-400` mixed systems). | `status-badge.tsx`, `stat-card.tsx`, `availability-timeline.tsx`, wizard, forms | Semantic tokens: `success / warning / info / violet / destructive` (+ subtle bg via `/10`), defined once. |
| 6 | Light/dark parity untested for status colours; `dark:text-red-400` mixes palettes. | multiple | Token values swap for dark; components never hardcode hue classes. |

### 1.2 Components
| # | Problem | Where | Fix |
|---|---|---|---|
| 7 | Buttons hover by fading to `bg-primary/80` (washed) instead of darkening; sizes are dense (default 32px, sm 28px). | `ui/button.tsx` | `hover:bg-primary-hover` (`#4338CA`); default h-9 (36px), sm h-8, lg h-10. |
| 8 | Cards are flat — hairline ring only, no shadow, hover is a grey tint. | `ui/card.tsx` | `border-border` + layered `shadow-soft`; hover lift on interactive cards. |
| 9 | Status badges are **dot + colour only** — colour is the only signal. | `status-badge.tsx` | Icon + colour + text for every status (CircleCheck / Clock / CircleX / TriangleAlert / …). |
| 10 | Empty states: small grey circle icon, no clear CTA hierarchy. | `empty-state.tsx` | 48px muted icon tile, one-line explanation, one primary CTA. |
| 11 | Stat cards are plain: grey label, grey icon, no surface identity. | `stat-card.tsx` | Tinted icon tile, tinted value per tone, tighter type. |
| 12 | Dropdowns/sheets/toasts use mixed radii + `shadow-md`, overlay is `bg-black/10`. | `ui/*` | 12px popover radius, `shadow-pop`, overlay `black/40` + blur. |
| 13 | No tooltip component for icon-only buttons. | — | Build when the first phase needs it (wizard quantity steppers). Every icon-only control gets `aria-label` + tooltip. |

### 1.3 Shell
| # | Problem | Fix |
|---|---|---|
| 14 | Topbar blurs (`bg-background/80 backdrop-blur`) without the glass recipe — inconsistent with the brief. | Glass navbar: `rgba(255,255,255,.65)` + `blur(12px) saturate(140%)` + soft shadow; dark `rgba(15,23,42,.55)`. |
| 15 | Sidebar active state is grey `bg-muted`; no brand presence; rows are 30px tall. | Active = indigo-tint (`sidebar-accent`, `#EEF2FF`); 32px rows; section labels 11px uppercase. |
| 16 | No gradient mesh, no glass anywhere. | Faint indigo/cyan mesh (6–8%) behind header + dashboard hero strip only. |
| 17 | Mobile sheet plain; no bottom-sheet treatment. | Side sheets rounded edge, bottom sheets `rounded-t-2xl`, overlay `black/40`. |

### 1.4 Screens
| # | Screen | Problems |
|---|---|---|
| 18 | Landing `/` | Text-only hero, no product visual; wrapping chip strip for the workflow (weak hierarchy); generic bordered feature boxes; CTA on a plain box; hero type exceeds the 32px ceiling. |
| 19 | Login / signup | Centred card on grey; no split layout; demo accounts buried in a second generic card; no role-based sign-in treatment. |
| 20 | Dashboard | Four flat KPI tiles; queue/schedule cards undifferentiated; no glass hero strip; no quick-action hierarchy. |
| 21 | Labs / equipment | Filter bars are raw forms with cramped controls (h-8 all), no active-filter feedback; cards lack identity and hover lift; availability signalled by red/green text only. |
| 22 | Availability timeline (hero) | Single 36px occupancy bar, not the Skedda grid (rows = resources, columns = time); no hour gridlines, no hover preview, no keyboard access; flat 70% bars, no labels. |
| 23 | Booking wizard | Three stacked cards; plain "1./2./3." text instead of an icon step indicator; summary panel solid, not glass; conflict UI is a stack of differently-coloured nested boxes. |
| 24 | My bookings | Filter pills with cramped count badges; no tab semantics; inline cancel form unstyled. |
| 25 | Approvals | Spacious card list, not inbox-dense; two colour-only badges per row; no keyboard approve/reject flow; no history trail. |
| 26 | Analytics | 8 KPI tiles in one grid (cluttered); heatmap floor at 6% opacity is unreadable; bar chart uses chart-1 grey; ranking lists are plain text rows. |
| 27 | Issues & returns / Scan | Nested bordered boxes (form inside card inside card); QR block visually raw; condition form cramped. |
| 28 | Waitlist / Admin | Long undifferentiated single column; every admin row is a bordered box; destructive actions (deactivate) look like neutral outline buttons. |
| 29 | Cross-cutting | Radii/padding drift (`rounded-lg` vs `rounded-xl`, `p-3` vs `p-5`); success text hardcoded `text-emerald-600`; toasts exist but are barely used after mutations. |

---

## 2. Design direction

Clean, professional, trustworthy — a modern SaaS product (Linear, Vercel, Cal.com) with university-grade calm.
- **One accent:** indigo. Everything else is slate + semantic status.
- **Minimal:** borders, spacing and type do the work; shadows are soft, never heavy.
- **Glass is a garnish:** only on the four surfaces listed in §5. Never the base style.
- **Light + dark from the same tokens.** No component hardcodes a hue.
- **Mobile-first for booking flows** (bottom sheet instead of modal under `sm`).

---

## 3. Tokens

Defined once in `src/app/globals.css`; Tailwind v4 theme maps them to utilities (`bg-primary`, `text-muted-foreground`, `shadow-soft`, `bg-success/10`, …).

### 3.1 Colour — light

| Token | Value | CSS var | Notes |
|---|---|---|---|
| primary | `#4F46E5` indigo-600 | `--primary` | one accent only |
| primary-hover | `#4338CA` indigo-700 | `--primary-hover` | hover state for solid primary |
| primary-subtle | `#EEF2FF` indigo-50 | `--accent`, `--sidebar-accent` | hover/menu tint, active nav |
| background | `#F8FAFC` slate-50 | `--background` | page canvas |
| surface / card | `#FFFFFF` | `--card`, `--popover`, `--sidebar` | all content surfaces |
| border | `#E2E8F0` slate-200 | `--border`, `--input` | hairlines |
| text | `#0F172A` slate-900 | `--foreground` | body + headings |
| muted text | `#64748B` slate-500 | `--muted-foreground` | secondary copy (AA on white: 4.8:1) |
| muted surface | `#F1F5F9` slate-100 | `--muted`, `--secondary` | quiet fills |
| ring | indigo-500 | `--ring` | focus ring at /50 |
| success | `#059669` emerald-600 | `--success` | available, approved, completed |
| warning | `#D97706` amber-600 | `--warning` | pending approval, maintenance, fair |
| info | `#2563EB` blue-600 | `--info` | booked / confirmed / reserved |
| violet | `#7C3AED` violet-600 | `--violet` | checked out / in use |
| destructive | `#E11D48` rose-600 | `--destructive` | rejected, conflict, overdue, damaged |

Status colours are **always** used as `bg-{tone}/10 text-{tone} border-{tone}/20` and always paired with an icon + text label.

### 3.2 Colour — dark

| Token | Value | Notes |
|---|---|---|
| background | slate-950 `#020617` | |
| card / popover / sidebar | slate-900 `#0F172A` | |
| border | `rgb(255 255 255 / 10%)` | white hairlines |
| foreground | slate-50 `#F8FAFC` | |
| muted-foreground | slate-400 `#94A3B8` | AA on slate-900 |
| primary | indigo-500 `#6366F1` | lighter for contrast |
| primary-hover | indigo-400 `#818CF8` | |
| success / warning / info / violet / destructive | 400-step equivalents | badges use `/10` fills |
| ring | indigo-400 `#818CF8` | |

`color-scheme` flips with the theme so native controls (date, time, select, checkbox) render correctly in dark mode.

### 3.3 Typography
- Family: **Geist** (sans) + Geist Mono for codes. No new font dependency.
- Scale: **12 / 14 / 16 / 20 / 24 / 32**
  - 12 `text-xs` — labels, helper text, table meta
  - 14 `text-sm` — **body default** (applied on `body`)
  - 16 `text-base` — card titles, section intros
  - 20 `text-xl` — page titles (`PageHeader`)
  - 24 `text-2xl` — section headings, stat values
  - 32 `text-[2rem]` — landing/hero only (replaces `text-4xl`/`text-5xl`)
- Headings semibold (600), `tracking-tight` at 20px+. Labels medium (500). Tabular numerals for metrics.

### 3.4 Spacing
4px base grid (Tailwind default). Standard paddings: controls 12–16, cards 16–20, page gutters 16 / 24 / 32 by breakpoint. Section rhythm `gap-6`, card grids `gap-4`.

### 3.5 Radius
`--radius: 8px` →
- inputs & buttons **8px** (`rounded-lg`)
- cards **12px** (`rounded-xl`)
- popovers/dropdowns **12px**
- modals **16px** (`rounded-2xl`), bottom sheets `rounded-t-2xl`
- badges pill (`--radius-4xl: 9999px`)

### 3.6 Elevation
- `shadow-xs` (built-in) — resting rows and small tiles
- `shadow-soft` — cards (layered: `0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)`)
- `shadow-pop` — dropdowns, popovers, modals
- Hover lift: `-translate-y-0.5` + shadow step, 150–200ms ease-out.
- Dark mode: elevation reads through borders, shadows stay subtle.

### 3.7 Motion
150ms ease-out for colour/opacity; 180–200ms for sheets/modals; slot selection smooth; toast on success. `prefers-reduced-motion` respected (no custom keyframe abuse). No flashy animation.

---

## 4. Icon system

- **Lucide only**, stroke 1.75 (default), sizes 16 (`size-4`), 20 (`size-5`), 24 (`size-6`). Colour inherits text or semantic tone.
- Sidebar/primary nav: always icon **plus** label. Icon-only buttons require `aria-label` + tooltip.
- Never colour alone: every status is icon + text.

### 4.1 App mapping

| Concept | Icon |
|---|---|
| Labs | `FlaskConical` |
| Equipment | `Microscope` |
| My bookings | `CalendarCheck` |
| New booking | `CalendarPlus` |
| Approvals | `ClipboardCheck` |
| Analytics | `BarChart3` |
| Scan / check-in-out | `QrCode` |
| Issues & returns | `PackageCheck` |
| Waitlist | `Hourglass` |
| Admin | `Settings2` |
| Notifications | `Bell` |
| Filters | `SlidersHorizontal` |
| Search | `Search` |
| Maintenance | `Wrench` |

### 4.2 Status → tone → icon

| Status | Tone | Icon |
|---|---|---|
| draft | neutral | `Pencil` |
| pending_approval | warning | `Clock` |
| approved | info | `CircleCheck` |
| reserved | info | `CalendarCheck2` |
| in_use | **violet** | `Play` |
| completed | success | `CircleCheckBig` |
| rejected | danger | `CircleX` |
| cancelled | neutral | `Ban` |
| overdue | danger | `TriangleAlert` |
| returned_late | warning | `Hourglass` |
| damaged | danger | `Wrench` |

Equipment/lab state reuses tones: operational/available/good → success; needs_service/under_maintenance/fair → warning; out_of_service/damaged → danger; closed/retired → neutral; reserved/in_use (lab) → info.

### 4.3 Guidance patterns
- Info icon + one-line helper under complex fields (why approval is needed).
- **Booking flow step indicator with icons**: Select resource → Pick time → Review → Confirm.
- Empty states: large muted icon, one-line explanation, one CTA.
- Inline conflict warning: `TriangleAlert` + what clashed + 2–3 suggested slots (data already provided by the booking engine).

---

## 5. Glassmorphism rules

Glass is allowed **only** on:
1. Sticky top navbar (landing + app shell)
2. Floating booking summary / side panel (wizard)
3. Modal dialogs (centre modals; side sheets & bottom sheets stay solid)
4. One hero stat strip on the dashboard

**Recipes**
- Light: `background rgba(255,255,255,.65)`, `backdrop-filter blur(12px) saturate(140%)`, border `rgba(255,255,255,.6)`, soft shadow.
- Dark: `background rgba(15,23,42,.55)`, border `rgba(255,255,255,.08)`.
- Fallback: `@supports not (backdrop-filter)` → solid `var(--card)` + normal border.
- Mesh: faint indigo/cyan radial gradients at 6–8% behind header + dashboard areas only (`bg-mesh`).
- **Never** glass on tables, forms, timeline/calendar grids, or text-heavy areas.
- Max one glass layer visible; no glass inside glass. Dropdown menus intentionally stay solid (text-heavy).
- Text on glass must pass AA; nav/tabular text sits on the solid-friendly side of the recipe.

Implemented as a `.glass` + `.bg-mesh` utility pair in `globals.css`.

---

## 6. Component contracts

Shared components are refactored **once** in Phase 1 and then composed by every screen.

| Component | Contract |
|---|---|
| Button | variants: default / outline / secondary / ghost / destructive / link; sizes xs→lg + icon sizes; primary hover `#4338CA`; 8px radius |
| Input / Textarea / NativeSelect | h-9, 8px radius, `bg-card`, indigo focus ring, visible label always |
| Card | 12px radius, border + `shadow-soft`; interactive cards lift on hover |
| Badge / StatusBadge / ToneBadge | icon + colour + text; tones from semantic tokens |
| Tabs | `line` variant for page-level switching (My bookings), segmented default for small toggles |
| Modal / Sheet | centre modal = glass + 16px radius; mobile = bottom sheet `rounded-t-2xl`; overlay `black/40` |
| Toast (sonner) | success feedback after mutations |
| Tooltip | required on icon-only controls (first use: wizard) |
| EmptyState | icon tile 48px, one-line explanation, one primary CTA |
| Skeleton | mirrors final layout; per-route `loading.tsx` where data is slow |
| Error state | inline alert: icon + what failed + retry path where possible |

**Every list or screen ships loading / empty / error states** — checked per phase.

---

## 7. Rebrand phases (stop after each page; confirm before the next)

| Phase | Scope | Key changes |
|---|---|---|
| **1 — Foundation** | `globals.css`, `ui/*`, shared components, app shell | Tokens, glass/mesh utilities, primitives, badges with icons, sidebar/topbar |
| **2 — Landing + auth** | `/`, `/login`, `/signup`, `(auth)` layout | Split layout, brand panel w/ glass card, 32px hero ceiling, role-based sign-in, demo accounts as first-class |
| **3 — Dashboards** | `/dashboard` | Glass hero stat strip + mesh, icon step-up, quick actions, queue/schedule hierarchy |
| **4 — Browse** | `/labs`, `/labs/[id]` (shell), `/equipment`, `/equipment/[id]` | Filter bar redesign, resource card identity + hover lift, availability with icon+label |
| **5 — Timeline (hero)** | `availability-timeline.tsx`, lab detail day grid | Rows = resources, columns = time, hour gridlines, hover preview, keyboard nav, conflict highlighting |
| **6 — Booking wizard** | `/bookings/new` | Icon step indicator, glass summary panel (+ mesh), conflict block redesign w/ alternatives |
| **7 — My bookings** | `/bookings`, `/bookings/[id]` | Tabs (Upcoming / Pending / Past), row hierarchy, styled cancel/reschedule |
| **8 — Approvals** | `/approvals` | Inbox-density list, one-click approve/reject, reason field, history trail |
| **9 — Analytics** | `/analytics` | KPI hierarchy (4+4), readable heatmap, branded charts, ranking rows |
| **10 — Issues & Scan** | `/issues`, `/scan` | Flat panels instead of nested boxes, QR block polish, condition notes |
| **11 — Waitlist + Admin** | `/waitlist`, `/admin` | Table treatment for admin rows, destructive action styling, section rhythm |
| **12 — Final pass** | all | Consistency, dark mode, responsive (360/768/1280), a11y, `npm run lint` + `typecheck` + `build` |

---

## 8. Avoid (hard rules)

- Heavy gradients, neon colours, glass on every card, more than one accent hue.
- Emoji as icons; mixing icon sets.
- Inconsistent radii or spacing; tiny low-contrast text.
- Colour as the only status signal.
- Any change to routes, server actions, data models, or booking logic.

---

## 9. Definition of done (per phase)

1. `npm run typecheck` and `npm run lint` clean.
2. Light **and** dark mode checked.
3. Responsive at 360 / 768 / 1280.
4. Focus rings visible; labels on all inputs; AA contrast on text.
5. Loading / empty / error states present for the screen's lists.
6. No logic, route, or schema changes in the diff.
7. Short summary written back to this file (phase log below) and to the user before moving on.

---

## 10. Phase log

- **Phase 0 (this doc):** audit + tokens + plan. 2026-10-01.
- **Phase 1 — Foundation:** tokens in `globals.css` (indigo/slate hex-exact, radii 8/12/16, soft shadows, glass + mesh, `color-scheme`), **Geist font wiring bug fixed** (`--font-sans` was self-referential), primitives refactored (button/card/input/select/tabs/sheet/menus/toast), status system now icon + colour + text with a new `violet` tone for `in_use`, shared components (stat card, empty state, booking row, shell, sidebar) rebuilt on tokens.
- **Phase 2 — Landing + auth:** landing hero with glass product-preview card + mesh, segmented 7-step flow strip, feature/role cards with icon tiles and hover lift, mesh CTA; auth becomes a split layout with a glass brand panel; login/signup are heading + form (no card-on-grey), demo accounts are role cards with icons; submit buttons get icons + spinners.
- **Phase 3 — Dashboards:** one glass hero stat strip with mesh behind it, icon step-up on every tile, quick actions as tiles with chevrons, overdue rows tinted destructive, coordinator rankings get rank numbers + bars.
- **Phase 4 — Browse:** filter bars (36px controls, search icon, `SlidersHorizontal` submit, result counts); resource cards get icon identity, hover lift, and availability is icon + text (never colour alone); equipment/lab badges carry icons; equipment detail notices use the warning token.
- **Phase 5 — Timeline (hero):** rebuilt as a Skedda-style grid — hour ruler, gridlines, tinted blocks with status labels and keyboard focus, hover preview via title + ring, icon legend.
- **Phase 6 — Booking wizard:** icon step indicator (Select resource → Pick time → Review → Confirm), segmented mode toggle, **glass summary panel** with mesh behind the page, all alert states tokenized (success/warning/destructive with icons), alternative slots as chips.
- **Phase 7 — My bookings:** underline tabs with counts (aria-current), booking detail card headers carry icons.
- **Phase 8 — Approvals:** inbox-style rows with requester initials, priority badge icons, purpose clamped, approve/reject with icons.
- **Phase 9 — Analytics:** 4 primary KPI cards + 4 compact mini stats, heatmap with muted zero-state and a Less→More legend, indigo recharts bar chart, ranking lists with rank + bars.
- **Phase 10 — Issues & Scan:** nested boxes flattened (return form is now flush inside the issue row), QR block polished, code lookup gets a QR affordance.
- **Phase 11 — Waitlist + Admin:** consistent row treatment, uppercase section headings with icons, destructive styling for user deactivation.
- **Phase 12 — Final pass:** every page fetched with real role sessions (student/faculty/staff/coordinator/admin) and markers verified; `typecheck`, `lint`, `build` clean; no hardcoded palette classes remain (grep-verified).

**Deferred:** visual tooltips on icon-only controls (aria-labels are in place everywhere); bottom-sheet variant of the booking summary on mobile (stacked, sticky-free layout is used instead).
