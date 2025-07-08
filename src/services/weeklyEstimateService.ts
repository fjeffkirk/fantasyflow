import { mlbStatService, PlayerDailyStat } from './mlbStatService';
import { dataService } from './dataService';
import { PlayerMatcher, ESPNPlayer } from './playerMatcher';

export interface WeeklyEstimate {
  runs: number;
  homeRuns: number;
  rbis: number;
  stolenBases: number;
  battingAverage: number;
  strikeouts: number;
  wins: number;
  saves: number;
  era: number;
  whip: number;
}

export interface PlayerEstimate {
  playerId: number;
  fullName: string;
  estimate: WeeklyEstimate;
  dataSource: 'last4weeks' | 'seasonAvg' | 'minorLeague' | 'noData';
  gamesProjected: number;
}

// Minor League Equivalency factors (simplified)
const MLE_FACTORS = {
  batting: {
    runs: 0.85,
    homeRuns: 0.80,
    rbis: 0.85,
    stolenBases: 0.90,
    battingAverage: 0.95
  },
  pitching: {
    strikeouts: 0.90,
    wins: 0.70,
    saves: 0.80,
    era: 1.15, // ERA gets worse in MLB
    whip: 1.10  // WHIP gets worse in MLB
  }
};

export class WeeklyEstimateService {
  private cache: Map<string, PlayerEstimate> = new Map();

  /**
   * Get weekly estimates for a team's projected starters
   */
  async getTeamWeeklyEstimate(teamId: number, week: number): Promise<WeeklyEstimate> {
    try {
      // Get the team's projected starters for the week
      const starters = await this.getProjectedStarters(teamId, week);
      
      // Get estimates for each starter
      const playerEstimates: PlayerEstimate[] = [];
      for (const starter of starters) {
        const estimate = await this.getPlayerWeeklyEstimate(starter.playerId, starter.fullName, week, starter);
        playerEstimates.push(estimate);
      }

      // Aggregate team totals
      return this.aggregateTeamEstimates(playerEstimates);
    } catch (error) {
      console.error(`[WeeklyEstimate] Failed to get team estimate for team ${teamId}, week ${week}:`, error);
      return this.getEmptyEstimate();
    }
  }

  /**
   * Get weekly estimate for a single player
   */
  async getPlayerWeeklyEstimate(playerId: number, fullName: string, week: number, espnMeta?: {teamAbbrev?:string, position?:string}): Promise<PlayerEstimate> {
    const cacheKey = `${playerId}-${week}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Determine MLB id first (ESPN id != MLB id). Use PlayerMatcher once using the first day of current week.
      const weekMetaMap = await dataService.getWeekMetaMap();
      const wkMeta = weekMetaMap[week];
      let mlbId = 0;
      if (wkMeta?.startISO) {
        const dateStr = wkMeta.startISO.split('T')[0];
        try {
          const mlbPlayers = await mlbStatService.getMLBPlayersForDate(dateStr);
          const matcher = new PlayerMatcher();
          const match = await matcher.matchPlayers([
            {
              playerId,
              fullName,
              teamAbbrev: espnMeta?.teamAbbrev,
              position: espnMeta?.position,
              lineupSlotId: 0,
            } as ESPNPlayer
          ], mlbPlayers);
          if (match.length > 0 && match[0].mlbPlayer && match[0].confidence > 0.5) {
            mlbId = match[0].mlbPlayer.id;
          }
        } catch (err) {
          console.warn(`[WeeklyEstimate] MLB mapping failed for ${fullName}`, err);
        }
      }

      // If still not mapped, try People search endpoint
      if (!mlbId) {
        try {
          const searchUrl = `https://statsapi.mlb.com/api/v1/people?search=${encodeURIComponent(fullName)}&sportId=1`;
          const res = await fetch(searchUrl);
          if (res.ok) {
            const data = await res.json();
            const person = data.people?.[0];
            if (person && person.id) {
              mlbId = person.id;
            }
          }
        } catch (err) {
          console.warn('MLB People search failed for', fullName, err);
        }
      }

      const targetId = mlbId || playerId; // fallback to espn id if no mapping

      // Try to get last 4 weeks of data using MLB id if available
      const last4WeeksData = await this.getLast4WeeksData(targetId, week);
      
      if (last4WeeksData.length > 0) {
        const estimate = this.calculateFromRecentData(last4WeeksData, fullName);
        this.cache.set(cacheKey, estimate);
        return estimate;
      }

      // Fallback to season average if less than 4 weeks
      const seasonData = await this.getSeasonAverage(playerId, week);
      if (seasonData.length > 0) {
        const estimate = this.calculateFromSeasonData(seasonData, fullName);
        this.cache.set(cacheKey, estimate);
        return estimate;
      }

      // Final fallback to minor league data (placeholder)
      const minorLeagueEstimate = await this.getMinorLeagueEstimate(playerId, fullName);
      this.cache.set(cacheKey, minorLeagueEstimate);
      return minorLeagueEstimate;

    } catch (error) {
      console.error(`[WeeklyEstimate] Failed to get estimate for player ${playerId}:`, error);
      const noDataEstimate: PlayerEstimate = {
        playerId,
        fullName,
        estimate: this.getEmptyEstimate(),
        dataSource: 'noData',
        gamesProjected: 0
      };
      this.cache.set(cacheKey, noDataEstimate);
      return noDataEstimate;
    }
  }

  /**
   * Get projected starters for a team for a given week
   */
  private async getProjectedStarters(teamId: number, week: number): Promise<Array<{playerId: number, fullName: string, teamAbbrev?: string, position?: string}>> {
    try {
      // Get the team's roster for the week
      const roster = await dataService.getTeamRoster(teamId, week);
      
      // Filter to get only starters (not bench/IL)
      const starters = roster.filter((player: any) => {
        // Use the same logic as the existing system for determining starters
        return player.lineupSlotId !== 16 && player.lineupSlotId !== 17 && player.status === 'ACTIVE';
      });

      return starters.map((player: any) => ({
        playerId: player.playerId,
        fullName: player.fullName || player.name || 'Unknown Player',
        teamAbbrev: player.team || player.teamAbbrev,
        position: player.position
      }));
    } catch (error) {
      console.error(`[WeeklyEstimate] Failed to get projected starters for team ${teamId}:`, error);
      return [];
    }
  }

  /**
   * Get last 4 weeks of MLB data for a player
   */
  private async getLast4WeeksData(playerId: number, currentWeek: number): Promise<PlayerDailyStat[]> {
    const stats: PlayerDailyStat[] = [];
    
    try {
      // Get the last 4 weeks of dates
      const weekMetaMap = await dataService.getWeekMetaMap();
      const weeks = [];
      
      for (let i = 1; i <= 4; i++) {
        const weekNum = currentWeek - i;
        if (weekNum > 0 && weekMetaMap[weekNum]) {
          weeks.push(weekNum);
        }
      }

      // Get stats for each week
      for (const weekNum of weeks) {
        const weekMeta = weekMetaMap[weekNum];
        if (!weekMeta) continue;

        // Get all days in this week (use startISO / endISO naming from WeekMeta)
        const startDate = weekMeta.startISO ? new Date(weekMeta.startISO) : null;
        const endDate = weekMeta.endISO ? new Date(weekMeta.endISO) : null;
        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.warn(`[WeeklyEstimate] Week ${weekNum} has invalid dates; skipping`);
          continue;
        }
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayStats = await mlbStatService.getDailyStatsMap(dateStr);
          
          if (dayStats[playerId]) {
            stats.push(dayStats[playerId]);
          }
        }
      }

      return stats;
    } catch (error) {
      console.error(`[WeeklyEstimate] Failed to get last 4 weeks data for player ${playerId}:`, error);
      return [];
    }
  }

  /**
   * Get season average data for a player
   */
  private async getSeasonAverage(playerId: number, currentWeek: number): Promise<PlayerDailyStat[]> {
    // For now, return empty array - this would need to be implemented
    // to get cumulative season stats from MLB API
    return [];
  }

  /**
   * Get minor league estimate (placeholder)
   */
  private async getMinorLeagueEstimate(playerId: number, fullName: string): Promise<PlayerEstimate> {
    // Placeholder implementation - would need minor league API integration
    return {
      playerId,
      fullName,
      estimate: this.getEmptyEstimate(),
      dataSource: 'minorLeague',
      gamesProjected: 7 // Assume 7 games per week
    };
  }

  /**
   * Calculate estimate from recent 4-week data
   */
  private calculateFromRecentData(stats: PlayerDailyStat[], fullName: string): PlayerEstimate {
    const totals = this.aggregatePlayerStats(stats);
    const gamesPlayed = stats.length;
    const gamesProjected = 7; // Assume 7 games per week
    
    // Project weekly totals based on recent performance
    const multiplier = gamesProjected / Math.max(gamesPlayed, 1);
    
    return {
      playerId: stats[0]?.playerId || 0,
      fullName,
      estimate: {
        runs: Math.round(totals.hitting.R * multiplier),
        homeRuns: Math.round(totals.hitting.HR * multiplier),
        rbis: Math.round(totals.hitting.RBI * multiplier),
        stolenBases: Math.round(totals.hitting.SB * multiplier),
        battingAverage: totals.hitting.AVG,
        strikeouts: Math.round(totals.pitching.K * multiplier),
        wins: Math.round(totals.pitching.W * multiplier),
        saves: Math.round(totals.pitching.SV * multiplier),
        era: totals.pitching.ERA,
        whip: totals.pitching.WHIP
      },
      dataSource: 'last4weeks',
      gamesProjected
    };
  }

  /**
   * Calculate estimate from season data
   */
  private calculateFromSeasonData(stats: PlayerDailyStat[], fullName: string): PlayerEstimate {
    // Similar to recent data but with season averages
    const totals = this.aggregatePlayerStats(stats);
    const gamesPlayed = stats.length;
    const gamesProjected = 7;
    
    const multiplier = gamesProjected / Math.max(gamesPlayed, 1);
    
    return {
      playerId: stats[0]?.playerId || 0,
      fullName,
      estimate: {
        runs: Math.round(totals.hitting.R * multiplier),
        homeRuns: Math.round(totals.hitting.HR * multiplier),
        rbis: Math.round(totals.hitting.RBI * multiplier),
        stolenBases: Math.round(totals.hitting.SB * multiplier),
        battingAverage: totals.hitting.AVG,
        strikeouts: Math.round(totals.pitching.K * multiplier),
        wins: Math.round(totals.pitching.W * multiplier),
        saves: Math.round(totals.pitching.SV * multiplier),
        era: totals.pitching.ERA,
        whip: totals.pitching.WHIP
      },
      dataSource: 'seasonAvg',
      gamesProjected
    };
  }

  /**
   * Aggregate individual player stats
   */
  private aggregatePlayerStats(stats: PlayerDailyStat[]): PlayerDailyStat {
    const totals: PlayerDailyStat = {
      playerId: stats[0]?.playerId || 0,
      date: '',
      hitting: { AB: 0, R: 0, H: 0, HR: 0, RBI: 0, SB: 0, AVG: 0 },
      pitching: { IP: 0, K: 0, W: 0, SV: 0, ERA: 0, WHIP: 0, QS: 0 }
    };

    let totalER = 0;
    let totalWHIPNumerator = 0;

    for (const stat of stats) {
      totals.hitting.AB += stat.hitting.AB;
      totals.hitting.R += stat.hitting.R;
      totals.hitting.H += stat.hitting.H;
      totals.hitting.HR += stat.hitting.HR;
      totals.hitting.RBI += stat.hitting.RBI;
      totals.hitting.SB += stat.hitting.SB;

      totals.pitching.IP += stat.pitching.IP;
      totals.pitching.K += stat.pitching.K;
      totals.pitching.W += stat.pitching.W;
      totals.pitching.SV += stat.pitching.SV;
      totals.pitching.QS += stat.pitching.QS;

      // For ERA and WHIP, we need to recalculate from components
      totalER += (stat.pitching.ERA * stat.pitching.IP) / 9;
      totalWHIPNumerator += stat.pitching.WHIP * stat.pitching.IP;
    }

    // Calculate final rates
    totals.hitting.AVG = totals.hitting.AB > 0 ? totals.hitting.H / totals.hitting.AB : 0;
    totals.pitching.ERA = totals.pitching.IP > 0 ? (totalER * 9) / totals.pitching.IP : 0;
    totals.pitching.WHIP = totals.pitching.IP > 0 ? totalWHIPNumerator / totals.pitching.IP : 0;

    return totals;
  }

  /**
   * Aggregate team estimates from individual players
   */
  private aggregateTeamEstimates(playerEstimates: PlayerEstimate[]): WeeklyEstimate {
    const totals = this.getEmptyEstimate();
    let battingAvgNumerator = 0;
    let battingAvgDenominator = 0;
    let eraTotal = 0;
    let whipTotal = 0;
    let pitchingCount = 0;

    for (const player of playerEstimates) {
      const est = player.estimate;
      
      // Sum counting stats
      totals.runs += est.runs;
      totals.homeRuns += est.homeRuns;
      totals.rbis += est.rbis;
      totals.stolenBases += est.stolenBases;
      totals.strikeouts += est.strikeouts;
      totals.wins += est.wins;
      totals.saves += est.saves;

      // Handle rate stats
      if (est.battingAverage > 0) {
        battingAvgNumerator += est.battingAverage;
        battingAvgDenominator += 1;
      }
      
      if (est.era > 0) {
        eraTotal += est.era;
        whipTotal += est.whip;
        pitchingCount += 1;
      }
    }

    // Calculate final rate stats
    totals.battingAverage = battingAvgDenominator > 0 ? battingAvgNumerator / battingAvgDenominator : 0;
    totals.era = pitchingCount > 0 ? eraTotal / pitchingCount : 0;
    totals.whip = pitchingCount > 0 ? whipTotal / pitchingCount : 0;

    return totals;
  }

  /**
   * Get empty estimate object
   */
  private getEmptyEstimate(): WeeklyEstimate {
    return {
      runs: 0,
      homeRuns: 0,
      rbis: 0,
      stolenBases: 0,
      battingAverage: 0,
      strikeouts: 0,
      wins: 0,
      saves: 0,
      era: 0,
      whip: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const weeklyEstimateService = new WeeklyEstimateService(); 