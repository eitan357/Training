# Running App Integration — Design Spec

**Date:** 2026-07-16  
**Status:** Approved

## Overview

Integrate a running tracker into the existing training diary app (vanilla JS + Firebase). The feature is gated to `eitan357@gmail.com` only. All other users see no change.

## Architecture

Single HTML file (`public/index.html`). The running feature is a new `#sec-running` section alongside existing sections (`#sec-strength`, `#sec-endurance`, etc.). Internal sub-views within the section handle navigation; the bottom nav bar is unchanged.

```
#sec-running
├── dashboard (default view)
│   ├── streak badge
│   ├── PRs card
│   ├── last workout card
│   ├── charts (Chart.js via CDN)
│   └── buttons: [הוסף אימון] [היסטוריה]
├── add-workout sub-view (3 steps)
│   ├── step 1: type selector
│   ├── step 2: OCR photo (Elliptical only, Tesseract.js via CDN)
│   └── step 3: review form
└── history sub-view
    └── workout list → detail expansion
```

## Feature Gate

- Settings page shows a toggle **only** when `currentUser.email === 'eitan357@gmail.com'`
- Toggle label: "הצג עמוד ריצה"
- When enabled: the `מדידות` slot in the bottom nav is replaced by `ריצה` (data unaffected)
- Persisted in Firestore: `users/{uid}/settings` → `runningEnabled: boolean`
- Loaded on auth state change; nav updates reactively

## Data Model (Firestore)

### `users/{uid}/runWorkouts`

| Field | Type | Required |
|---|---|---|
| date | string (YYYY-MM-DD) | ✓ |
| workoutTypeId | string | ✓ |
| distanceKm | number | ✓ |
| durationMinutes | number | ✓ |
| paceMinPerKm | number (calculated) | ✓ |
| calories | number \| null | |
| avgStridesPerMin | number \| null | |
| avgHeartRate | number \| null | |
| feltTired | boolean | ✓ (default false) |
| notes | string \| null | |
| createdAt | Firestore timestamp | ✓ |

### `users/{uid}/runWorkoutTypes`

| Field | Type |
|---|---|
| name | string |
| order | number |

Initialized on first visit with `["Running", "Elliptical"]`.

## Calculations (pure JS, ported from TypeScript)

- `calcPace(durationMinutes, distanceKm)` → min/km
- `formatPace(paceMinPerKm)` → `"MM:SS"`
- `calcStreak(workouts)` → consecutive weeks with ≥1 workout
- `calcPRs(workouts)` → `{ bestDistanceKm, bestPaceMinPerKm, lowestHeartRate }`
- `filterByTimeRange(workouts, range)` → filter by `'month'|'year'|'all'`

## Dashboard View

Displayed directly in `#sec-running`:

1. **Streak badge** — "X שבועות רצופים"
2. **PRs card** — מרחק מירבי / קצב מהיר / דופק נמוך
3. **Last workout card** — תאריך, סוג, מרחק, משך, קצב
4. **Charts** — 5 line charts via Chart.js; time range selector (חודש / שנה / הכל)
   - מרחק (km) — blue `#2563eb`
   - דופק ממוצע (bpm) — red `#dc2626`
   - קצב (min/km) — green `#16a34a`
   - קלוריות (kcal) — amber `#d97706`
   - צעדים/דקה (spm) — purple `#7c3aed`
5. **Navigation buttons** — `הוסף אימון` and `היסטוריה` at top

## Add Workout Flow

### Step 1 — Type Select
- Buttons for each workout type from `runWorkoutTypes`
- Selecting "Elliptical" → Step 2; any other → Step 3

### Step 2 — OCR (Elliptical only)
- Tesseract.js loaded via CDN on demand
- Camera/file input; processing spinner; error fallback
- On success: pre-fills Step 3 form fields
- "הכנס ידנית" skips OCR → Step 3 empty

### Step 3 — Review Form
- Fields: תאריך* (date picker, defaults today), מרחק* (km), משך* (minutes), קלוריות, צעדים/דק', דופק ממוצע, עייפות (toggle), הערות (textarea)
- Validation: date, distanceKm, durationMinutes required
- On save: compute `paceMinPerKm = calcPace(duration, distance)`, write to Firestore, return to dashboard

## History Sub-view

- Reverse-chronological list of all `runWorkouts`
- Each row: date, workout type name, distance, pace, tired icon
- Tap row → expand inline with full fields
- "חזרה" button → dashboard
- Empty state: "עוד לא נרשמו אימונים"

## UI Style

Follows existing app conventions:
- Dark theme (`#1a1a2e` background, `#e0e0e0` text)
- Cards: `.run-card` — same border-radius and padding as existing `.card` elements
- RTL layout (`dir="rtl"`)
- Hebrew labels throughout
- No new fonts or icon libraries

## CDN Dependencies Added

```html
<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<!-- Tesseract.js (loaded on demand, only inside OCR step) -->
```

Tesseract.js is loaded lazily (only when the OCR step is reached) to avoid slowing initial load.

## Error Handling

- OCR failure: toast + "הכנס ידנית" fallback always visible
- Firestore write failure: toast with retry option
- No data: empty state messages per section
- Offline: reuse existing app offline detection pattern

## Out of Scope

- Workout types management UI (add/delete types) — types are initialized but not user-editable in this phase
- Social features, sharing, export
- Notifications or reminders
