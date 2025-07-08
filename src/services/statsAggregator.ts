import { mlbStatService } from './mlbStatService';
import { dataService, STARTER_SLOT_IDS } from './dataService';

interface TeamStats {
  runs: number; homeRuns: number; rbis: number; stolenBases: number; hits: number; battingAverage: number;
  strikeouts: number; wins: number; saves: number; era: number; whip: number; qualityStarts: number;
}

function blankStats(): TeamStats {
  return { runs:0, homeRuns:0, rbis:0, stolenBases:0, hits:0, battingAverage:0,
    strikeouts:0, wins:0, saves:0, era:0, whip:0, qualityStarts:0 };
}

function getRosterForDate(teamId:number, date:string): number[] {
  const snap = localStorage.getItem(`roster-history-${date}`);
  if (!snap) return [];
  try {
    const payload = JSON.parse(snap) as { snapshotDate:string; createdAt:number; teams:Array<{teamId:number;players:Array<{id:number;slot:number}>}> };
    const team = payload.teams.find(t=>t.teamId===teamId);
    if (!team) return [];
    return team.players.filter(p=>STARTER_SLOT_IDS.includes(p.slot)).map(p=>p.id);
  } catch { return []; }
}

// Simple helper for logging aggregate progress
function logDay(teamId:number, date:string, starters:number, ab:number, ip:number) {
  console.log(`[Agg] ${date} Team ${teamId} starters=${starters} AB=${ab} IP=${ip}`);
}

export async function computeWeekStats(matchupPeriodId:number, startISO:string): Promise<Record<number, TeamStats>> {
  // build list of 7 date strings
  const dates:string[] = [];
  const start = new Date(startISO);
  for(let i=0;i<7;i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate()+i);
    dates.push(d.toISOString().slice(0,10));
  }

  const teams = await dataService.getTeams();
  const result: Record<number, TeamStats> = {};

  for (const team of teams) {
    const agg = blankStats();
    let totalAB = 0, totalH = 0, totalIP = 0, totalER = 0, totalWHIPNum = 0;
    for (const ds of dates) {
      const dayMap = await mlbStatService.getDailyStatsMap(ds);
      const playerIds = getRosterForDate(team.id, ds);
      if (playerIds.length === 0) {
        console.warn(`[Agg] No starters for team ${team.id} on ${ds}`);
        continue;
      }
      for (const pid of playerIds) {
        const stat = dayMap[pid];
        if (!stat) continue;
        // Hitting
        agg.runs += stat.hitting.R;
        agg.homeRuns += stat.hitting.HR;
        agg.rbis += stat.hitting.RBI;
        agg.stolenBases += stat.hitting.SB;
        agg.hits += stat.hitting.H;
        totalAB += stat.hitting.AB;
        totalH += stat.hitting.H;

        // Pitching counting stats
        agg.strikeouts += stat.pitching.K;
        agg.wins += stat.pitching.W;
        agg.saves += stat.pitching.SV;
        agg.qualityStarts += stat.pitching.QS;

        // Pitching rate accumulators
        const ip = stat.pitching.IP;
        const eraRate = stat.pitching.ERA;
        const whipRate = stat.pitching.WHIP;
        if (ip > 0) {
          totalIP += ip;
          totalER += (eraRate * ip) / 9;
          totalWHIPNum += whipRate * ip;
        }
      }
      logDay(team.id, ds, playerIds.length, totalAB, totalIP);
    }
    // finalize rates
    agg.battingAverage = totalAB ? +(totalH / totalAB).toFixed(3) : 0;
    agg.era = totalIP ? +((totalER * 9) / totalIP).toFixed(2) : 0;
    agg.whip = totalIP ? +(totalWHIPNum / totalIP).toFixed(2) : 0;
    result[team.id] = agg;
  }
  console.log('[Agg] Completed week aggregation', matchupPeriodId, result);
  return result;
} 