/*
 * Utility helpers for working with ESPN Fantasy Baseball weeks.
 *
 * These helpers are entirely data-driven – **no hard-coded week numbers**.
 * Given the raw `schedule` array returned from the ESPN League endpoint we:
 *   1.  Group all schedule entries by `matchupPeriodId` (ESPN week).
 *   2.  Collect every `scoringPeriodId` that belongs to the week.
 *   3.  Derive the start / end dates for the week by inspecting timestamps
 *       present on schedule entries (the API surface varies slightly between
 *       ESPN versions, so we detect a handful of commonly-seen keys).
 *   4.  Produce a human-readable label, e.g. "Week 15 (Jun 30 – Jul 6)".
 *
 * Consumers (e.g. `dataService`) should use `buildWeekMetaMap` once per boot
 * and cache the result. The returned structure is deterministic and can be
 * stringified for client-side caching.
 */

export type WeekMeta = {
  /** ESPN `matchupPeriodId` – AKA "ESPN week" */
  matchupPeriodId: number;
  /** All scoring period ids (daily ids) that belong to this week */
  scoringPeriodIds: number[];
  /** ISO string for first day in the week (local timezone) */
  startISO: string | null;
  /** ISO string for last day in the week (local timezone) */
  endISO: string | null;
  /** Readable label – e.g. "Week 15 (Jun 30 – Jul 6)" */
  label: string;
};

/**
 * Attempt to coerce a variety of timestamp fields to a Date instance.
 * We purposefully support several property names because ESPN sometimes
 * changes them between endpoints.
 */
function extractDate(entry: any): Date | null {
  const candidates = [
    entry.date,
    entry.matchupDate,
    entry.startDate,
    entry.gameStart,
    entry.gameStartTime,
    entry.eventDate,
    entry.firstPlayedDate,
  ];

  for (const ts of candidates) {
    if (ts == null) continue;
    // ESPN dates are often milliseconds since epoch but sometimes ISO strings.
    if (typeof ts === 'number') {
      // Treat small numbers as seconds (rare) – multiply by 1000 in that case.
      const millis = ts < 1e12 ? ts * 1000 : ts;
      return new Date(millis);
    }
    if (typeof ts === 'string') {
      const d = new Date(ts);
      if (!isNaN(d.valueOf())) return d;
    }
  }

  return null;
}

/** Format a Date as "Mon D" using en-US locale. */
function formatShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Build a map of week -> metadata purely from ESPN schedule data.
 *
 * @param schedule Raw `schedule` array from ESPN league endpoint.
 *                 Expected to contain `matchupPeriodId` & `scoringPeriodId`.
 */
export function buildWeekMetaMap(schedule: any[]): Record<number, WeekMeta> {
  const grouped: Record<
    number,
    { scoring: Set<number>; dates: Date[] }
  > = {};

  for (const entry of schedule) {
    const mpId: number | undefined = entry.matchupPeriodId;
    const spId: number | undefined = entry.scoringPeriodId;
    if (typeof mpId !== 'number' || typeof spId !== 'number') continue;

    if (!grouped[mpId]) {
      grouped[mpId] = { scoring: new Set<number>(), dates: [] };
    }

    grouped[mpId].scoring.add(spId);

    const d = extractDate(entry);
    if (d) grouped[mpId].dates.push(d);
  }

  const weekMetaMap: Record<number, WeekMeta> = {};

  for (const mpIdStr of Object.keys(grouped)) {
    const mpId = Number(mpIdStr);
    const scoringIds = Array.from(grouped[mpId].scoring).sort((a, b) => a - b);
    const dates = grouped[mpId].dates.sort((a, b) => a.getTime() - b.getTime());

    const startDate = dates[0] ?? null;
    const endDate = dates[dates.length - 1] ?? null;

    const labelParts = [`Week ${mpId}`];
    if (startDate && endDate) {
      labelParts.push(`(${formatShort(startDate)} – ${formatShort(endDate)})`);
    }

    weekMetaMap[mpId] = {
      matchupPeriodId: mpId,
      scoringPeriodIds: scoringIds,
      startISO: startDate ? startDate.toISOString() : null,
      endISO: endDate ? endDate.toISOString() : null,
      label: labelParts.join(' '),
    };
  }

  return weekMetaMap;
}

/**
 * Convenience helper: given today (defaults to now) and a pre-computed
 * weekMetaMap, determine the current ESPN matchupPeriodId.
 */
export function getCurrentMatchupPeriod(
  weekMetaMap: Record<number, WeekMeta>,
  today: Date = new Date(),
): number | null {
  const ts = today.getTime();
  for (const wk of Object.values(weekMetaMap)) {
    if (wk.startISO && wk.endISO) {
      const start = new Date(wk.startISO).getTime();
      const end = new Date(wk.endISO).getTime();
      if (ts >= start && ts <= end) return wk.matchupPeriodId;
    }
  }

  // Fallback: return the largest week that started before today, else null.
  const pastWeeks = Object.values(weekMetaMap)
    .filter(wk => wk.startISO && new Date(wk.startISO).getTime() <= ts)
    .sort((a, b) => b.matchupPeriodId - a.matchupPeriodId);
  return pastWeeks[0]?.matchupPeriodId ?? null;
} 