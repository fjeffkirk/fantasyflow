// API Configuration
export const API_CONFIG = {
  ESPN_BASE_URL: import.meta.env.VITE_API_URL || '/espn',
  LEAGUE_ID: import.meta.env.VITE_LEAGUE_ID || 24414,
  SEASON: import.meta.env.VITE_SEASON_ID || new Date().getFullYear(),
  // Add your ESPN cookies here for authentication
  ESPN_COOKIES: {
    espn_s2: 'YOUR_ESPN_S2_COOKIE_HERE',
    SWID: 'YOUR_SWID_COOKIE_HERE'
  }
};

// Types for API responses
export interface ESPNTeam {
  id: number;
  location: string;
  nickname: string;
  owners: Array<{
    firstName: string;
    lastName: string;
  }>;
  record: {
    overall: {
      wins: number;
      losses: number;
      ties: number;
    };
  };
  roster: {
    entries: Array<{
      playerId: number;
      playerPoolEntry: {
        player: {
          id: number;
          fullName: string;
          defaultPositionId: number;
          proTeamId: number;
          stats: any[];
        };
      };
    }>;
  };
}

export interface ESPNMatchup {
  id: number;
  matchupPeriodId: number;
  home: {
    teamId: number;
    totalPoints: number;
    rosterForCurrentScoringPeriod: any;
  };
  away: {
    teamId: number;
    totalPoints: number;
    rosterForCurrentScoringPeriod: any;
  };
}

// API Service Class
export class FantasyAPIService {
  private async makeESPNRequest(endpoint: string, scoringPeriodId?: number) {
    const url = `${API_CONFIG.ESPN_BASE_URL}/apis/v3/games/flb/seasons/${API_CONFIG.SEASON}/segments/0/leagues/${API_CONFIG.LEAGUE_ID}${endpoint}`;
    const params = new URLSearchParams();
    
    if (scoringPeriodId) {
      params.append('scoringPeriodId', scoringPeriodId.toString());
    }
    
    params.append('view', 'mTeam');
    params.append('view', 'mRoster');
    params.append('view', 'mMatchup');
    params.append('view', 'mSettings');
    
    const requestUrl = `${url}?${params.toString()}`;
    
    try {
      const response = await fetch(requestUrl, {
        headers: {
          'Cookie': `espn_s2=${API_CONFIG.ESPN_COOKIES.espn_s2}; SWID=${API_CONFIG.ESPN_COOKIES.SWID}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('ESPN API request failed:', response.status, errorText);
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('ESPN API request failed:', error);
      throw error;
    }
  }
  
  private playerIdCache: Map<string, number> = new Map();

  /**
   * ESPN uses its own internal player IDs.  We need the MLBAM `personId` for the
   * StatsAPI.  Resolve by querying the public search endpoint once and caching
   * the result for later calls.
   */
  async getMlbIdByName(fullName: string): Promise<number | null> {
    if (this.playerIdCache.has(fullName)) {
      return this.playerIdCache.get(fullName)!;
    }

    try {
      const query = encodeURIComponent(fullName);
      // This part of the logic is no longer needed as MLB API is removed.
      // If ESPN player names are directly usable, this cache might be redundant.
      // For now, we'll return null as there's no MLB API to fetch player IDs.
      return null;
    } catch (error) {
      if (import.meta.env.VITE_DEBUG === 'true') {
        console.error('Failed to map player to MLB id:', fullName, error);
      }
      return null;
    }
  }
  
  // ESPN Fantasy API Methods
  async getLeagueInfo() {
    try {
      const data = await this.makeESPNRequest('');
      return {
        id: data.id,
        name: data.settings.name,
        size: data.settings.size,
        scoringPeriodId: data.scoringPeriodId,
        currentMatchupPeriod: data.status.currentMatchupPeriod,
        teams: data.teams?.map((team: ESPNTeam) => ({
          id: team.id,
          name: `${team.location} ${team.nickname}`,
          owner: team.owners?.[0] ? `${team.owners[0].firstName} ${team.owners[0].lastName}` : 'Unknown',
          wins: team.record?.overall?.wins || 0,
          losses: team.record?.overall?.losses || 0,
          ties: team.record?.overall?.ties || 0
        })) || []
      };
    } catch (error) {
      console.error('Failed to fetch league info:', error);
      throw error;
    }
  }
  
  async getTeamRoster(teamId: number, scoringPeriodId?: number) {
    try {
      const data = await this.makeESPNRequest('', scoringPeriodId);
      const team = data.teams?.find((t: ESPNTeam) => t.id === teamId);
      
      if (!team) {
        throw new Error(`Team ${teamId} not found`);
      }
      
      return team.roster?.entries?.map((entry: any) => ({
        id: entry.playerId,
        name: entry.playerPoolEntry.player.fullName,
        position: this.getPositionName(entry.playerPoolEntry.player.defaultPositionId),
        proTeamId: entry.playerPoolEntry.player.proTeamId,
        stats: entry.playerPoolEntry.player.stats || []
      })) || [];
    } catch (error) {
      console.error('Failed to fetch team roster:', error);
      throw error;
    }
  }
  
  async getMatchups(scoringPeriodId?: number) {
    try {
      const data = await this.makeESPNRequest('', scoringPeriodId);
      return data.schedule?.filter((matchup: ESPNMatchup) => 
        !scoringPeriodId || matchup.matchupPeriodId === scoringPeriodId
      ).map((matchup: ESPNMatchup) => ({
        id: matchup.id,
        week: matchup.matchupPeriodId,
        homeTeamId: matchup.home?.teamId,
        awayTeamId: matchup.away?.teamId,
        homeScore: matchup.home?.totalPoints || 0,
        awayScore: matchup.away?.totalPoints || 0
      })) || [];
    } catch (error) {
      console.error('Failed to fetch matchups:', error);
      throw error;
    }
  }
  
  // Helper Methods
  private getPositionName(positionId: number): string {
    const positions: { [key: number]: string } = {
      1: 'C', 2: '1B', 3: '2B', 4: '3B', 5: 'SS', 6: 'OF',
      7: 'OF', 8: 'OF', 9: 'DH', 13: 'P', 14: 'P', 15: 'P'
    };
    return positions[positionId] || 'UTIL';
  }
  
  getCurrentWeek(): number {
    const now = new Date();
    const seasonStart = new Date(`${API_CONFIG.SEASON}-03-28`); // MLB season typically starts late March
    const diffTime = Math.abs(now.getTime() - seasonStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7);
  }
  
  getWeekDateRange(week: number): { startDate: string; endDate: string } {
    const seasonStart = new Date(`${API_CONFIG.SEASON}-03-28`);
    const weekStart = new Date(seasonStart);
    weekStart.setDate(seasonStart.getDate() + (week - 1) * 7);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0]
    };
  }
  
  // Calculate weekly team stats from player data
  calculateWeeklyTeamStats(playerStats: any[]): any {
    const teamStats = {
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
    
    let totalHits = 0;
    let totalAtBats = 0;
    let totalInnings = 0;
    let totalEarnedRuns = 0;
    let totalWalksHits = 0;
    
    playerStats.forEach(player => {
      if (player.batting) {
        teamStats.runs += player.batting.runs || 0;
        teamStats.homeRuns += player.batting.homeRuns || 0;
        teamStats.rbis += player.batting.rbi || 0;
        teamStats.stolenBases += player.batting.stolenBases || 0;
        totalHits += player.batting.hits || 0;
        totalAtBats += player.batting.atBats || 0;
      }
      
      if (player.pitching) {
        teamStats.strikeouts += player.pitching.strikeOuts || 0;
        teamStats.wins += player.pitching.wins || 0;
        teamStats.saves += player.pitching.saves || 0;
        totalInnings += player.pitching.inningsPitched || 0;
        totalEarnedRuns += player.pitching.earnedRuns || 0;
        totalWalksHits += (player.pitching.baseOnBalls || 0) + (player.pitching.hits || 0);
      }
    });
    
    // Calculate averages
    teamStats.battingAverage = totalAtBats > 0 ? totalHits / totalAtBats : 0;
    teamStats.era = totalInnings > 0 ? (totalEarnedRuns * 9) / totalInnings : 0;
    teamStats.whip = totalInnings > 0 ? totalWalksHits / totalInnings : 0;
    
    return teamStats;
  }
}

// Create singleton instance
export const fantasyAPI = new FantasyAPIService();

// Export configuration for setup
export const API_SETUP_INSTRUCTIONS = {
  espn: {
    description: "To use ESPN Fantasy API, you need to provide authentication cookies",
    steps: [
      "1. Log into your ESPN Fantasy league in a web browser",
      "2. Open developer tools (F12) and go to Application/Storage tab",
      "3. Find the cookies for fantasy.espn.com",
      "4. Copy the values for 'espn_s2' and 'SWID' cookies",
      "5. Update API_CONFIG.ESPN_COOKIES in apiService.ts"
    ],
    cookiesNeeded: ["espn_s2", "SWID"]
  },
  mlb: {
    description: "MLB Stats API is public and doesn't require authentication",
    baseUrl: "https://statsapi.mlb.com/api/v1",
    documentation: "https://appac.github.io/mlb-data-api-docs/"
  }
};