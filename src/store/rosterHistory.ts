import { dataService, STARTER_SLOT_IDS } from '../services/dataService';

const MAX_SNAPSHOTS = 7;

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h >>> 0;
}

const KEY_PREFIX = 'roster-history-';

async function getCurrentWeekSafe() {
  try {
    return await dataService.getCurrentWeek();
  } catch {
    return 1; // fallback
  }
}

export async function snapshotToday(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${KEY_PREFIX}${today}`;
  const existingRaw = localStorage.getItem(key);
  const existingHash = existingRaw ? (() => { try { return JSON.parse(existingRaw).hash; } catch { return null; } })() : null;

  try {
    const teams = await dataService.getTeams();
    const snapshots: any[] = [];
    for (const t of teams) {
      const week = await getCurrentWeekSafe();
      const roster = await dataService.getTeamRoster(t.id, week);
      const players = roster.map(p => ({ id: p.playerId, slot: p.lineupSlotId }));
      snapshots.push({ teamId: t.id, players });
    }
    // compute hash
    const hashSource = JSON.stringify(snapshots);
    const hash = simpleHash(hashSource);
    if (hash === existingHash) {
      console.log(`[RosterHistory] Snapshot unchanged for ${today}`);
    } else {
      const payload = { snapshotDate: today, createdAt: Date.now(), hash, teams: snapshots };
      localStorage.setItem(key, JSON.stringify(payload));
      console.log(`[RosterHistory] Snapshot for ${today} saved (${snapshots.length} teams)`);
    }

    // Prune old snapshots
    const keys = Object.keys(localStorage).filter(k => k.startsWith(KEY_PREFIX));
    if (keys.length > MAX_SNAPSHOTS) {
      keys.sort(); // lexicographic sorts by date since YYYY-MM-DD
      const toDelete = keys.slice(0, keys.length - MAX_SNAPSHOTS);
      toDelete.forEach(k => localStorage.removeItem(k));
      if (toDelete.length) console.log(`[RosterHistory] Pruned ${toDelete.length} old snapshots`);
    }
  } catch (err) {
    console.warn('[RosterHistory] Failed snapshot:', err);
  }
}

/** Ensure we have snapshots for every day in the given matchup week. */
export async function backfillCurrentWeek(matchupPeriodId: number, startISO: string): Promise<void> {
  // Build array of date strings Mon-Sun
  const base = new Date(startISO);
  base.setUTCHours(0,0,0,0);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    dates.push(d.toISOString().slice(0,10));
  }

  // Determine which dates are missing
  const missing = dates.filter(ds => !localStorage.getItem(`${KEY_PREFIX}${ds}`));
  if (missing.length === 0) return;

  const teams = await dataService.getTeams();
  // We need scoringPeriodIds for the matchup week to fetch historical rosters
  const scoringIds = await dataService.getScoringPeriodIdsForWeek(matchupPeriodId);
  // Fallback: if we don't have daily scoring ids, use matchupPeriodId for all
  while (scoringIds.length < 7) scoringIds.push(matchupPeriodId);

  for (let idx = 0; idx < missing.length; idx++) {
    const dateStr = missing[idx];
    const scoringId = scoringIds[idx] || matchupPeriodId;
    const key = `${KEY_PREFIX}${dateStr}`;

    try {
      const snapshots: any[] = [];
      for (const t of teams) {
        const roster = await dataService.getTeamRoster(t.id, scoringId);
        const players = roster.map((p: any) => ({ id: p.playerId, slot: p.lineupSlotId }));
        snapshots.push({ teamId: t.id, players });
      }
      const payload = { snapshotDate: dateStr, createdAt: Date.now(), hash: simpleHash(JSON.stringify(snapshots)), teams: snapshots };
      localStorage.setItem(key, JSON.stringify(payload));
      console.log(`[RosterHistory] Back-filled snapshot for ${dateStr}`);
    } catch(e) {
      console.warn(`[RosterHistory] Failed back-fill for ${dateStr}`, e);
    }
  }

  // Prune to MAX_SNAPSHOTS (already handled by snapshotToday but call again)
  const keys = Object.keys(localStorage).filter(k => k.startsWith(KEY_PREFIX));
  if (keys.length > MAX_SNAPSHOTS) {
    keys.sort();
    const toDelete = keys.slice(0, keys.length - MAX_SNAPSHOTS);
    toDelete.forEach(k => localStorage.removeItem(k));
  }
} 