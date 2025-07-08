// Core Fantasy Baseball Types
export interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  stats: PlayerStats;
}

export interface PlayerStats {
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

export interface Team {
  id: number;
  name: string;
  owner: string;
  wins: number;
  losses: number;
  ties?: number;
  players: Player[];
}

export interface WeeklyStats {
  week: number;
  teamStats: {
    [teamId: number]: PlayerStats;
  };
}

export interface Matchup {
  week: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  categoryResults: {
    [category: string]: 'team1' | 'team2' | 'tie';
  };
}

export interface ScoringCategory {
  name: string;
  key: keyof PlayerStats;
  type: 'batting' | 'pitching';
}

// API Response Types
export interface ESPNLeagueResponse {
  id: number;
  settings: {
    name: string;
    size: number;
  };
  scoringPeriodId: number;
  status: {
    currentMatchupPeriod: number;
  };
  teams: ESPNTeam[];
  schedule?: ESPNMatchup[];
}

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

// Component Props Types
export interface DashboardProps {
  leagueId: number;
}

export interface MatchupComparisonProps {
  teams: Team[];
  weeklyStats: WeeklyStats[];
}

export interface WeeklyStatsProps {
  teams: Team[];
  selectedWeek: number;
}

// Utility Types
export type CategoryWinner = 'team1' | 'team2' | 'tie';

export interface TeamStanding extends Team {
  winPercentage: number;
  games: number;
  rank: number;
}

export interface WeeklyHigh {
  value: number;
  team: string;
  week: number;
}

export interface APIHealthStatus {
  espn: boolean;
  mlb: boolean;
}

export interface DataServiceConfig {
  useRealAPI: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
}

export interface RosterEntry {
  playerId: number;
  lineupSlotId: number;
  status: string;
  eligibleSlots: number[];
  player: {
    id: number;
    fullName: string;
    position: string;
    proTeam: string;
  };
}