// Vite provides the "ImportMetaEnv" interface globally, but TypeScript may
// complain inside plain .ts files. Declare a minimal interface here so we can
// access import.meta.env without compilation errors when type definitions are
// missing (will be merged with the global one). Remove if already defined.
declare global {
  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
}
// Direct ESPN Fantasy Baseball API Service
export const ESPN_CONFIG = {
  SEASON: Number(import.meta.env.VITE_SEASON_ID) || 2025,
  BASE_URL: 'http://localhost:3001/espn',
};

export interface ESPNTeamRoster {
  teamId: number;
  teamName: string;
  owner: string;
  players: Array<{
    name: string;
    position: string;
    team: string;
    playerId: number;
    lineupSlotId?: number;
  }>;
}

export interface ESPNLeagueInfo {
  id: number;
  name: string;
  season: number;
  currentMatchupPeriod?: number;
  scoringPeriodId?: number;
  divisions?: Array<{
    id: number;
    name: string;
    size?: number;
  }>;
  teams: Array<{
    id: number;
    name: string;
    abbrev?: string;
    location?: string;
    nickname?: string;
    owner: string;
    wins: number;
    losses: number;
    ties: number;
    divisionId?: number;
    divisionName?: string;
  }>;
  schedule?: any[];
}

export class ESPNApiService {
  private async makeRequest(endpoint: string, scoringPeriodId?: number): Promise<any> {
    const leagueId = localStorage.getItem('leagueId') || '24414'; // Default to original ID if not set
    const url = `${ESPN_CONFIG.BASE_URL}/apis/v3/games/flb/seasons/${ESPN_CONFIG.SEASON}/segments/0/leagues/${leagueId}${endpoint}`;
    
    const params = new URLSearchParams();
    if (scoringPeriodId) {
      params.append('scoringPeriodId', scoringPeriodId.toString());
    }
    
    // Add necessary views for comprehensive league data including divisions
    params.append('view', 'mTeam');
    params.append('view', 'mRoster');
    params.append('view', 'mMatchup');
    params.append('view', 'mSettings');
    params.append('view', 'mSchedule'); // Important for division data
    params.append('view', 'mStandings'); // May contain division standings
    
    const requestUrl = `${url}?${params.toString()}`;

    const espnS2 = localStorage.getItem('espn_s2');
    const swid = localStorage.getItem('swid');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (espnS2 && swid) {
      headers['x-espn-s2'] = espnS2;
      headers['x-swid'] = swid;
    }

    // Log outgoing request details for debugging
    console.log('[ESPN API] Request:', requestUrl);

    let response: Response | null = null;
    let attempt = 0;
    while (attempt < 2 && !response) {
      try {
        response = await fetch(requestUrl, { headers });
      } catch (err:any) {
        attempt += 1;
        if (err.name === 'AbortError') {
          console.warn(`[ESPN API] Timeout after 3s (attempt ${attempt})`);
          if (attempt >= 2) throw new Error('TIMEOUT');
          continue;
        }
        throw err;
      }
    }

    try {
      // response guaranteed defined here
      
      if (!response!.ok) {
        const errorText = await response!.text();
        console.error('[ESPN API] Error response:', {
          status: response!.status,
          statusText: response!.statusText,
          headers: Object.fromEntries(response!.headers.entries()),
          body: errorText.slice(0, 200)
        });
        throw new Error(`ESPN API error: ${response!.status} ${response!.statusText}`);
      }

      const text = await response!.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        console.error('[ESPN API] Non-JSON body received (truncated):', text.slice(0, 200));
        throw new Error('ESPN API returned non-JSON body');
      }
    } catch (error) {
      console.error('[ESPN API] Request failed:', error);
      throw error;
    }
  }

  async getLeagueInfo(): Promise<ESPNLeagueInfo> {
    try {
      // Use a current scoringPeriodId like the working calls
      // We'll use a recent scoring period to get current league state
      const currentScoringPeriodId = 118; // Based on the working calls in console
      const data = await this.makeRequest('', currentScoringPeriodId);
      console.log('[ESPN API] getLeagueInfo response:', data);
      
      // Create a lookup map from owner IDs to member names
      const memberMap = new Map<string, string>();
      if (data.members) {
        data.members.forEach((member: any) => {
          const displayName = member.displayName || '';
          const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
          const ownerName = fullName || displayName || 'Unknown Owner';
          memberMap.set(member.id, ownerName);
        });
      }
      
      // Search for division data in all common locations
      let divisionInfo = 'DIVISION DATA SEARCH RESULTS:\n\n';
      let divisions: Array<{ id: number; name: string; size?: number }> = [];
      
      // 1. Check settings.scheduleSettings for division data
      if (data.settings?.scheduleSettings) {
        divisionInfo += '1. scheduleSettings: ' + JSON.stringify(data.settings.scheduleSettings, null, 2) + '\n\n';
        
        // Look for divisions array
        if (data.settings.scheduleSettings.divisions) {
          divisionInfo += '   Found divisions in scheduleSettings!\n';
          divisions = data.settings.scheduleSettings.divisions.map((div: any) => ({
            id: div.id || div.divisionId,
            name: div.name || div.divisionName || `Division ${div.id}`,
            size: div.size || div.teamCount
          }));
        }
        
        // Look for divisionSettings
        if (data.settings.scheduleSettings.divisionSettings) {
          divisionInfo += '   Found divisionSettings!\n';
        }
      }
      
      // 2. Check if divisions exist directly in settings
      if (data.settings?.divisions) {
        divisionInfo += '2. settings.divisions: ' + JSON.stringify(data.settings.divisions, null, 2) + '\n\n';
        if (!divisions.length) {
          divisions = data.settings.divisions.map((div: any) => ({
            id: div.id || div.divisionId,
            name: div.name || div.divisionName || `Division ${div.id}`,
            size: div.size || div.teamCount
          }));
        }
      }
      
      // 3. Check segments (sometimes divisions are represented as segments)
      if (data.segments) {
        divisionInfo += '3. segments: ' + JSON.stringify(data.segments, null, 2) + '\n\n';
      }
      
      // 4. Check segmentId
      if (data.segmentId !== undefined) {
        divisionInfo += '4. segmentId: ' + JSON.stringify(data.segmentId) + '\n\n';
      }
      
      // 5. Check teams for division references
      if (data.teams) {
        divisionInfo += '5. Team division data:\n';
        data.teams.forEach((team: any, index: number) => {
          if (index < 3) { // Only show first 3 teams to avoid too much output
            const teamDivisionData = {
              teamId: team.id,
              teamName: team.name,
              divisionId: team.divisionId,
              division: team.division,
              playoffSeed: team.playoffSeed,
              record: team.record
            };
            divisionInfo += `   Team ${team.id}: ${JSON.stringify(teamDivisionData, null, 2)}\n`;
          }
        });
        divisionInfo += '\n';
      }
      
      // 6. Check schedule for division data
      if (data.schedule) {
        divisionInfo += '6. schedule (first item): ' + JSON.stringify(data.schedule[0], null, 2) + '\n\n';
      }
      
      // 7. Check for any other division-related fields
      const otherFields = ['draftSettings', 'rosterSettings', 'scoringSettings', 'tradeSettings'];
      otherFields.forEach(field => {
        if (data.settings?.[field]) {
          const fieldData = data.settings[field];
          if (JSON.stringify(fieldData).toLowerCase().includes('division')) {
            divisionInfo += `7. ${field} (contains "division"): ${JSON.stringify(fieldData, null, 2)}\n\n`;
          }
        }
      });
      
      // Show comprehensive division search results
      console.log('[ESPN API] Division search results:', divisionInfo);
      
      // Create division name lookup map
      const divisionMap = new Map<number, string>();
      divisions.forEach(div => {
        divisionMap.set(div.id, div.name);
      });
      
      return {
        id: data.id,
        name: data.settings?.name || 'Unknown League',
        season: ESPN_CONFIG.SEASON,
        currentMatchupPeriod: data.status?.currentMatchupPeriod || data.status?.scoringPeriodId || data.scoringPeriodId,
        scoringPeriodId: data.status?.scoringPeriodId || data.scoringPeriodId,
        divisions: divisions.length > 0 ? divisions : undefined,
        teams: data.teams?.map((team: any) => ({
          id: team.id,
          name: team.name || team.abbrev || `Team ${team.id}`,
          abbrev: team.abbrev || '',
          location: team.location,
          nickname: team.nickname,
          owner: team.owners?.[0] ? memberMap.get(team.owners[0]) || 'Unknown Owner' : 'Unknown Owner',
          wins: team.record?.overall?.wins || 0,
          losses: team.record?.overall?.losses || 0,
          ties: team.record?.overall?.ties || 0,
          divisionId: team.divisionId,
          divisionName: team.divisionId ? divisionMap.get(team.divisionId) : undefined
        })) || [],
        schedule: data.schedule || []
      };
    } catch (error) {
      console.error('Failed to get league info:', error);
      throw error;
    }
  }

  async getAllTeamRosters(week?: number): Promise<ESPNTeamRoster[]> {
    try {
      const data = await this.makeRequest('', week);
      const rosters: ESPNTeamRoster[] = [];

      // Create a lookup map from owner IDs to member names
      const memberMap = new Map<string, string>();
      if (data.members) {
        data.members.forEach((member: any) => {
          const displayName = member.displayName || '';
          const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
          const ownerName = fullName || displayName || 'Unknown Owner';
          memberMap.set(member.id, ownerName);
        });
      }

      for (const team of data.teams || []) {
        const roster: ESPNTeamRoster = {
          teamId: team.id,
          teamName: team.name || team.abbrev || `Team ${team.id}`,
          owner: team.owners?.[0] ? memberMap.get(team.owners[0]) || 'Unknown Owner' : 'Unknown Owner',
          players: []
        };

        // Extract players from roster
        if (team.roster?.entries) {
          roster.players = team.roster.entries.map((entry: any) => {
            const player = entry.playerPoolEntry.player;
            return {
              name: player?.fullName || 'Unknown Player',
              position: this.getPositionName(player?.defaultPositionId),
              team: this.getTeamAbbreviation(player?.proTeamId),
              playerId: player?.id || 0,
              lineupSlotId: entry.lineupSlotId,
              status: player?.injuryStatus || 'ACTIVE',
              eligibleSlots: player?.eligibleSlots || [],
            };
          });
        }

        rosters.push(roster);
      }

      return rosters;
    } catch (error) {
      console.error('Failed to get team rosters:', error);
      throw error;
    }
  }

  async getTeamRoster(teamId: number, week?: number): Promise<any> {
    try {
      const data = await this.makeRequest('', week);
      const team = data.teams?.find((t: any) => t.id === teamId);

      if (!team) {
        throw new Error(`Team with ID ${teamId} not found`);
      }

      // Create a lookup map from owner IDs to member names
      const memberMap = new Map<string, string>();
      if (data.members) {
        data.members.forEach((member: any) => {
          const displayName = member.displayName || '';
          const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
          const ownerName = fullName || displayName || 'Unknown Owner';
          memberMap.set(member.id, ownerName);
        });
      }

      const roster: ESPNTeamRoster = {
        teamId: team.id,
        teamName: team.name || team.abbrev || `Team ${team.id}`,
        owner: team.owners?.[0] ? memberMap.get(team.owners[0]) || 'Unknown Owner' : 'Unknown Owner',
        players: []
      };

      // Extract players from roster
      if (team.roster?.entries) {
        roster.players = team.roster.entries.map((entry: any) => {
          const player = entry.playerPoolEntry.player;
          return {
            name: player?.fullName || 'Unknown Player',
            position: this.getPositionName(player?.defaultPositionId),
            team: this.getTeamAbbreviation(player?.proTeamId),
            playerId: player?.id || 0,
            lineupSlotId: entry.lineupSlotId,
            status: player?.injuryStatus || 'ACTIVE'
          };
        });
      }

      return roster;
    } catch (error) {
      console.error('Failed to get team roster:', error);
      throw error;
    }
  }

  // Add these helper methods to fix linter errors
  private getPositionName(positionId: number): string {
    // Correct mapping from defaultPositionId to position name for Fantasy Baseball
    const positions: Record<number, string> = {
      // Batters
      2: 'C',
      3: '1B',
      4: '2B',
      5: '3B',
      6: 'SS',
      7: 'LF',
      8: 'CF',
      9: 'RF',
      10: 'DH',
      12: 'UTIL',
      // Pitchers
      1: 'P',
      11: 'RP',
      13: 'SP',
      14: 'P',
      15: 'P'
    };
    return positions[positionId] || 'N/A';
  }

  private getTeamAbbreviation(teamId: number): string {
    const teams: Record<number, string> = {
      0: "FA", 1: "BAL", 2: "BOS", 3: "LAA", 4: "CHW", 5: "CLE", 6: "DET",
      7: "KC", 8: "MIL", 9: "MIN", 10: "NYY", 11: "OAK", 12: "SEA",
      13: "TEX", 14: "TOR", 15: "ATL", 16: "CHC", 17: "CIN", 18: "HOU",
      19: "LAD", 20: "WSH", 21: "NYM", 22: "PHI", 23: "PIT", 24: "STL",
      25: "SD", 26: "SF", 27: "COL", 28: "MIA", 29: "AZ", 30: "TB"
    };
    return teams[teamId] || 'FA';
  }
}