/**
 * Availability and conflict detection.
 *
 * All time maths is done in minutes since midnight so that comparisons are
 * integer comparisons and cannot drift.
 *
 * Windows are treated as half-open, [start, end). A booking that ends at 11:00
 * does not conflict with one that starts at 11:00. This matches the default
 * behaviour of the Postgres `tsrange` used by the `bookings_no_lab_overlap`
 * EXCLUDE constraint in `0003_conflict_guard.sql` — app and database must agree
 * on this or the pre-check and the constraint will disagree.
 */

export type TimeWindow = {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, 24-hour. */
  start: string;
  /** `HH:MM`, 24-hour, exclusive. */
  end: string;
};

/** Anything that can be compared against a window. */
export type ExistingBooking = TimeWindow & { id: string };

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time "${time}", expected HH:MM.`);
  }
  return hours * 60 + minutes;
}

export function fromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function durationMinutes(window: TimeWindow): number {
  return toMinutes(window.end) - toMinutes(window.start);
}

export function isValidWindow(window: TimeWindow): boolean {
  return toMinutes(window.end) > toMinutes(window.start);
}

/** Half-open overlap. Adjacent windows do not conflict. */
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  if (a.date !== b.date) return false;
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

/**
 * Every existing booking that clashes with the candidate, ignoring one booking
 * by id — used when rescheduling, where the booking's own current slot must not
 * count as a conflict with itself.
 */
export function findConflicts<T extends ExistingBooking>(
  candidate: TimeWindow,
  existing: readonly T[],
  ignoreId?: string,
): T[] {
  return existing.filter((item) => item.id !== ignoreId && windowsOverlap(candidate, item));
}

export type AlternativeSlotOptions = {
  /** Lab opening time, `HH:MM`. */
  openTime: string;
  /** Lab closing time, `HH:MM`. */
  closeTime: string;
  /** Granularity to scan at. Defaults to 30 minutes. */
  stepMinutes?: number;
  /** Maximum number of suggestions to return. Defaults to 5. */
  limit?: number;
  /** How many days forward to search once the chosen date is exhausted. */
  searchDays?: number;
};

/**
 * Suggest other times on the same lab.
 *
 * Scans the day in `stepMinutes` increments and returns every gap long enough
 * for the requested duration. If the chosen date yields nothing, walks forward
 * up to `searchDays` so a fully-booked day still produces a useful answer
 * rather than a dead end.
 */
export function findAlternativeSlots(
  desired: TimeWindow,
  existing: readonly ExistingBooking[],
  options: AlternativeSlotOptions,
): TimeWindow[] {
  const {
    openTime,
    closeTime,
    stepMinutes = 30,
    limit = 5,
    searchDays = 7,
  } = options;

  const duration = durationMinutes(desired);
  if (duration <= 0) return [];

  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  if (close - open < duration) return [];

  const found: TimeWindow[] = [];

  for (let dayOffset = 0; dayOffset <= searchDays; dayOffset += 1) {
    const date = addDays(desired.date, dayOffset);

    for (let start = open; start + duration <= close; start += stepMinutes) {
      const candidate: TimeWindow = {
        date,
        start: fromMinutes(start),
        end: fromMinutes(start + duration),
      };

      if (findConflicts(candidate, existing).length === 0) {
        found.push(candidate);
        if (found.length >= limit) return found;
      }
    }
  }

  return found;
}

export type LabCandidate = {
  id: string;
  name: string;
  capacity: number;
  departmentId: string;
  facilities: string[];
};

export type LabAvailability = {
  lab: LabCandidate;
  /** True when nothing else occupies the window. */
  isFree: boolean;
  /** Bookings that clash, when the window is taken. */
  conflicts: ExistingBooking[];
};

/**
 * Check a set of labs against one window.
 *
 * `bookingsByLab` maps a lab id to its active bookings.
 */
export function checkLabs(
  candidate: TimeWindow,
  labs: readonly LabCandidate[],
  bookingsByLab: Record<string, readonly ExistingBooking[]>,
): LabAvailability[] {
  return labs.map((lab) => {
    const conflicts = findConflicts(candidate, bookingsByLab[lab.id] ?? []);
    return { lab, isFree: conflicts.length === 0, conflicts };
  });
}

/**
 * Free labs only, ordered by how tightly capacity fits the expected headcount.
 *
 * A 40-seat lab for a 5-person session wastes the room; the closest fit is the
 * most useful suggestion. Labs too small for the headcount are dropped.
 */
export function findAlternativeLabs(
  candidate: TimeWindow,
  labs: readonly LabCandidate[],
  bookingsByLab: Record<string, readonly ExistingBooking[]>,
  expectedAttendees: number,
): LabCandidate[] {
  return checkLabs(candidate, labs, bookingsByLab)
    .filter((entry) => entry.isFree && entry.lab.capacity >= expectedAttendees)
    .sort((a, b) => a.lab.capacity - b.lab.capacity)
    .map((entry) => entry.lab);
}

/** Date arithmetic on `YYYY-MM-DD` without pulling in a date library. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
