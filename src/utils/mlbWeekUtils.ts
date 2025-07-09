import { WeekMeta } from './weekUtils';

/**
 * Given an ordered list of Date objects representing every MLB game day in a season,
 * build an ESPN-style week meta map (Monday-Sunday blocks).
 */
export function buildWeekMetaMapFromMLB(dates: Date[]): Record<number, WeekMeta> {
  if (dates.length === 0) return {};
  // Find the first Monday on or after the first game date
  const first = new Date(dates[0]);
  const firstMon = new Date(first);
  while (firstMon.getUTCDay() !== 1) {
    firstMon.setUTCDate(firstMon.getUTCDate() + 1);
  }
  const map: Record<number, WeekMeta> = {};
  let matchup = 1;
  const msPerDay = 24 * 60 * 60 * 1000;
  const ptr = new Date(firstMon);
  const last = new Date(dates[dates.length - 1]);

  while (ptr <= last && matchup <= 30) {
    const start = new Date(ptr);
    const end = new Date(ptr.getTime() + 6 * msPerDay);

    const scoringPeriodIds: number[] = [];
    for (let i = 0; i < 7; i++) {
      const dayOrdinal = Math.floor((start.getTime() + i * msPerDay - first.getTime()) / msPerDay) + 1;
      scoringPeriodIds.push(dayOrdinal);
    }

    const label = `Week ${matchup} (${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })} – ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })})`;

    map[matchup] = {
      matchupPeriodId: matchup,
      scoringPeriodIds,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label,
    };

    matchup += 1;
    ptr.setUTCDate(ptr.getUTCDate() + 7);
  }

  return map;
} 