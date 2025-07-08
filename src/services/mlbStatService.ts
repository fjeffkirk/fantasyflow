import { mlbApiService } from './mlbApiService';

export interface PlayerDailyStat {
  playerId: number;
  date: string; // YYYY-MM-DD
  hitting: {
    AB: number;
    R: number;
    H: number;
    HR: number;
    RBI: number;
    SB: number;
    AVG: number;
  };
  pitching: {
    IP: number;
    K: number;
    W: number;
    SV: number;
    ERA: number;
    WHIP: number;
    QS: number;
  };
}

/*
 * VERY light wrapper around MLB statsapi to fetch a single day of stats.
 * In production you would batch players and cache aggressively.
 */
export class MLBStatService {
  private cache: Map<string, PlayerDailyStat> = new Map();

  private dayCache: Map<string, Record<number, PlayerDailyStat>> = new Map();
  private playersCache: Map<string, any[]> = new Map();

  /**
   * Return a map of playerId -> PlayerDailyStat for a given date (YYYY-MM-DD).
   * Uses MLB schedule endpoint which returns individual game box-score stats so
   * the numbers are single-day, not cumulative season totals.
   */
  async getDailyStatsMap(date: string): Promise<Record<number, PlayerDailyStat>> {
    if (this.dayCache.has(date)) return this.dayCache.get(date)!;

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,metadata,stats&gameTypes=R`;
    const map: Record<number, PlayerDailyStat> = {};

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MLB schedule fetch failed ${res.status}`);
      const data = await res.json();

      for (const d of data.dates || []) {
        for (const g of d.games || []) {
          const gamePk = g.gamePk;
          const extract = (teamObj: any) => {
            if (!teamObj?.players) return;
            for (const pidKey of Object.keys(teamObj.players)) {
              const p = teamObj.players[pidKey];
              const id = p.id;
              if (!id) continue;
              const batting = p.stats?.batting ?? {};
              const pitching = p.stats?.pitching ?? {};

              if (!map[id]) {
                map[id] = {
                  playerId: id,
                  date,
                  hitting: { AB:0,R:0,H:0,HR:0,RBI:0,SB:0,AVG:0 },
                  pitching: { IP:0,K:0,W:0,SV:0,ERA:0,WHIP:0,QS:0 }
                };
              }
              const tgt = map[id];
              // Batting accumulations
              tgt.hitting.R += Number(batting.runs || 0);
              tgt.hitting.HR += Number(batting.homeRuns || 0);
              tgt.hitting.RBI += Number(batting.rbi || 0);
              tgt.hitting.SB += Number(batting.stolenBases || 0);
              tgt.hitting.H += Number(batting.hits || 0);
              tgt.hitting.AB += Number(batting.atBats || 0);
              // AVG we'll compute at end

              // Pitching accumulations
              tgt.pitching.K += Number(pitching.strikeOuts || 0);
              tgt.pitching.W += Number(pitching.wins || 0);
              tgt.pitching.SV += Number(pitching.saves || 0);
              // ERA/WHIP require rate stats; we approximate by weighting
              const ip = Number(pitching.inningsPitched || 0);
              const er = Number(pitching.earnedRuns || 0);
              const h = Number(pitching.hits || 0);
              const bb = Number(pitching.baseOnBalls || 0);
              tgt.pitching.IP += ip;
              tgt.pitching.ERA += er; // store ER total for later rate calc
              tgt.pitching.WHIP += h + bb; // store numerator for WHIP rate calc
              // QS determination
              if (ip >= 6 && er <= 3) tgt.pitching.QS += 1;
            }
          };
          extract(g.teams?.home);
          extract(g.teams?.away);
        }
      }

      // Finalize AVG/ERA/WHIP
      for (const stat of Object.values(map)) {
        stat.hitting.AVG = stat.hitting.AB ? +(stat.hitting.H / stat.hitting.AB).toFixed(3) : 0;
        stat.pitching.ERA = stat.pitching.IP ? +( (stat.pitching.ERA * 9) / stat.pitching.IP ).toFixed(2) : 0;
        stat.pitching.WHIP = stat.pitching.IP ? +( stat.pitching.WHIP / stat.pitching.IP ).toFixed(2) : 0;
      }

      this.dayCache.set(date, map);
      return map;
    } catch (err) {
      console.error('[MLBStatService] day stats fail:', err);
      this.dayCache.set(date, map); // cache empty to avoid retry burst
      return map;
    }
  }

  /**
   * Get all MLB players for a given date with their stats and info
   * This is used for fuzzy matching with ESPN players
   */
  async getMLBPlayersForDate(date: string): Promise<Array<{
    id: number;
    fullName: string;
    gamePk?: number;
    team: { name: string; abbreviation: string };
    position?: { code: string; name: string };
    stats: { batting?: any; pitching?: any };
  }>> {
    // Cache per-date: if we've fetched once, skip heavy work
    if (this.playersCache.has(date)) {
      return this.playersCache.get(date)!;
    }

    const playersMap: Record<number, any> = {};

    try {
      // Use new bulk stats endpoint – one for hitters, one for pitchers
      const buildUrl = (group: 'hitting' | 'pitching') =>
        `https://statsapi.mlb.com/api/v1/stats?stats=game&sportId=1&date=${date}&group=${group}`;

      const [hitRes, pitchRes] = await Promise.all([
        fetch(buildUrl('hitting')),
        fetch(buildUrl('pitching')),
      ]);

      if (!hitRes.ok || !pitchRes.ok) {
        console.warn('[MLBStatService] Bulk endpoint returned non-OK, falling back to boxscores');
        const fallbackPlayers = await this.getPlayersViaBoxscores(date);
        this.playersCache.set(date, fallbackPlayers);
        return fallbackPlayers;
      }

      const [hitData, pitchData] = await Promise.all([hitRes.json(), pitchRes.json()]);

      const ingest = (data: any, type: 'hitting' | 'pitching') => {
        const splits = data?.stats?.[0]?.splits || [];
        for (const s of splits) {
          const pid = s?.player?.id;
          if (!pid) continue;
          if (!playersMap[pid]) {
            playersMap[pid] = {
              id: pid,
              fullName: s.player?.fullName || 'Unknown',
              team: {
                name: s.team?.name || 'Unknown',
                abbreviation: s.team?.abbreviation || 'UNK',
              },
              stats: {},
            };
          }
          if (type === 'hitting') playersMap[pid].stats.batting = s.stat;
          else playersMap[pid].stats.pitching = s.stat;
        }
      };

      ingest(hitData, 'hitting');
      ingest(pitchData, 'pitching');

      const arr = Object.values(playersMap);
      console.log(`[MLBStatService] Bulk stats loaded: ${arr.length} players for ${date}`);

      // Store in dayCache under a special key so future calls are instant
      this.playersCache.set(date, arr);
      return arr;
    } catch (err) {
      console.warn('[MLBStatService] Bulk fetch failed, using boxscore fallback', err);
      const fb = await this.getPlayersViaBoxscores(date);
      this.playersCache.set(date, fb);
      return fb;
    }
  }

  /** Fallback: original per-game boxscore extraction when bulk endpoint fails */
  private async getPlayersViaBoxscores(date: string): Promise<any[]> {
    const players: any[] = [];
    try {
      const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameTypes=R`;
      const schedRes = await fetch(schedUrl);
      if (!schedRes.ok) throw new Error('schedule fetch fail');
      const sched = await schedRes.json();

      const gamePkList: number[] = [];
      for (const d of sched.dates || []) {
        for (const g of d.games || []) if (g.gamePk) gamePkList.push(g.gamePk);
      }

      await Promise.all(gamePkList.map(async gp => {
        try {
          const boxUrl = `https://statsapi.mlb.com/api/v1/game/${gp}/boxscore`;
          const boxRes = await fetch(boxUrl);
          if (!boxRes.ok) return;
          const box = await boxRes.json();
          const extract = (teamData:any, teamInfo:any) => {
            if (!teamData?.players) return;
            for (const key of Object.keys(teamData.players)) {
              const p = teamData.players[key];
              if (!p?.person?.id) continue;
              players.push({
                id:p.person.id,
                fullName:p.person.fullName,
                team:{ name:teamInfo?.name||'UNK', abbreviation:teamInfo?.abbreviation||'UNK'},
                stats:{ batting:p.stats?.batting, pitching:p.stats?.pitching}
              });
            }
          };
          extract(box.teams?.home, box.teams?.home?.team); // team may not exist same structure
          extract(box.teams?.away, box.teams?.away?.team);
        }catch{}
      }));
      return players;
    }catch(err){
      console.error('[MLBStatService] boxscore fallback fail', err);
      return players;
    }
  }

  private buildCacheKey(pid: number, date: string) {
    return `${pid}-${date}`;
  }

  async getDailyStat(playerId: number, date: string): Promise<PlayerDailyStat | null> {
    const key = this.buildCacheKey(playerId, date);
    if (this.cache.has(key)) return this.cache.get(key)!;

    const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&date=${date}&sportId=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MLB stats fetch failed ${res.status}`);
      const data = await res.json();

      const hittingRow = data.stats?.[0]?.splits?.[0]?.stat || {};
      const pitchingRow = data.stats?.[1]?.splits?.[0]?.stat || {};

      const stat: PlayerDailyStat = {
        playerId,
        date,
        hitting: {
          AB: Number(hittingRow.atBats || 0),
          R: Number(hittingRow.runs || 0),
          H: Number(hittingRow.hits || 0),
          HR: Number(hittingRow.homeRuns || 0),
          RBI: Number(hittingRow.rbi || 0),
          SB: Number(hittingRow.stolenBases || 0),
          AVG: Number(hittingRow.avg || 0),
        },
        pitching: {
          IP: Number(pitchingRow.inningsPitched || 0),
          K: Number(pitchingRow.strikeOuts || 0),
          W: Number(pitchingRow.wins || 0),
          SV: Number(pitchingRow.saves || 0),
          ERA: Number(pitchingRow.era || 0),
          WHIP: Number(pitchingRow.whip || 0),
          QS: 0, // MLB API doesn’t provide QS directly; compute later
        },
      };

      this.cache.set(key, stat);
      return stat;
    } catch (err) {
      console.error('[MLBStatService] Error fetching stat:', err);
      return null;
    }
  }
}

export const mlbStatService = new MLBStatService(); 