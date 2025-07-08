import { fantasyAPI } from './apiService';
import { ESPNApiService } from './espnApiService';
import * as weekUtils from '../utils/weekUtils';
import { mlbApiService } from './mlbApiService';
import { buildWeekMetaMapFromMLB } from '../utils/mlbWeekUtils';
import { mlbStatService } from './mlbStatService';
import { playerMatcher, ESPNPlayer, MLBPlayer } from './playerMatcher';

// League uses 22 starter slots: hitters (0-12) and pitchers (13-21).
// Bench = 23, IL = 24-25, NA = 26.  Only include 0-21.
export const STARTER_SLOT_IDS = [
  // Hitters
  0, 1, 2, 3, 4, 5, 6,       // C, 1B, 2B, 3B, SS, MI, CI
  7, 8, 9, 10,               // OF x4
  11, 12,                    // UTIL x2
  // Pitchers
  13, 14,                    // SP x2
  15, 16,                    // RP x2
  17, 18, 19, 20, 21         // P  x5
];

interface APIConfig {
  useRealAPI: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
  maxConcurrentRequests: number;
  requestDeduplication: boolean;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

interface RequestStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  pendingRequests: number;
  activeRequests: number;
}

// Helper: Build a map of week number (matchupPeriodId) to scoringPeriodIds from league.schedule
function buildWeekToScoringPeriodMap(schedule: any[] = []): Record<number, number[]> {
  const map: Record<number, number[]> = {};
  
  // Use the simple approach that works with existing ESPN libraries
  for (const matchup of schedule) {
    const week = matchup.matchupPeriodId;
    const scoringPeriod = matchup.scoringPeriodId;
    
    if (week && scoringPeriod) {
      if (!map[week]) map[week] = [];
      if (!map[week].includes(scoringPeriod)) {
        map[week].push(scoringPeriod);
      }
    }
  }
  
  return map;
}

// Helper: Merge an array of stats objects by summing each stat field
function mergeStats(statsArray: any[]): any {
  const totals: { [key: string]: number } = {
    runs: 0, homeRuns: 0, rbis: 0, hits: 0, stolenBases: 0, battingAverage: 0, strikeouts: 0, wins: 0, saves: 0, era: 0, whip: 0, qualityStarts: 0
  };
  let avgCount = 0;
  for (const stats of statsArray) {
    for (const key in totals) {
      if (key === 'battingAverage' && typeof stats[key] === 'number') {
        totals[key] += stats[key];
        avgCount++;
      } else if (typeof stats[key] === 'number') {
        totals[key] += stats[key];
      }
    }
  }
  if (avgCount > 0) totals.battingAverage = totals.battingAverage / avgCount;
  return totals;
}

async function getCurrentWeekSafe(ds: DataService) {
  try {
    return await ds.getCurrentWeek();
  } catch {
    return 1; // fallback
  }
}

class DataService {
  private config: APIConfig = {
    useRealAPI: true, // ALWAYS use real API - no mock data
    enableCaching: true,
    cacheTimeout: 12 * 60 * 60 * 1000, // 12 hours
    maxConcurrentRequests: 10,
    requestDeduplication: true,
  };

  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestStats: RequestStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    pendingRequests: 0,
    activeRequests: 0,
  };

  private espnService: ESPNApiService;
  private weekToScoringPeriodMap: Record<number, number[]> | null = null;
  private weekMetaMap: Record<number, any> | null = null;

  constructor() {
    this.espnService = new ESPNApiService();
    // Capture daily roster snapshot
    import('../../src/store/rosterHistory').then(m => m.snapshotToday());
  }

  getConfig(): APIConfig {
    return { ...this.config };
  }

  getRequestStats(): RequestStats {
    return { ...this.requestStats, pendingRequests: this.pendingRequests.size };
  }

  private async fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    this.requestStats.totalRequests++;
    
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
        this.requestStats.cacheHits++;
        return cached.data as T;
      }
    }

    // Check for pending requests (deduplication)
    if (this.config.requestDeduplication) {
      const pending = this.pendingRequests.get(key);
      if (pending) {
        console.log(`🔄 Reusing pending request for: ${key}`);
        return pending.promise;
      }
    }

    this.requestStats.cacheMisses++;
    this.requestStats.activeRequests++;

    // Create new request
    const requestPromise = this.executeRequest(key, fetcher);
    
    // Track pending request
    if (this.config.requestDeduplication) {
      this.pendingRequests.set(key, {
        promise: requestPromise,
        timestamp: Date.now()
      });
    }

    try {
      const data = await requestPromise;
      
      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(key, { data, timestamp: Date.now() });
      }
      
      return data;
    } catch (error) {
      this.requestStats.errors++;
      throw error;
    } finally {
      this.requestStats.activeRequests--;
      this.pendingRequests.delete(key);
    }
  }

  private async executeRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    try {
      console.log(`🌐 Making API request: ${key}`);
      const data = await fetcher();
      console.log(`✅ API request completed: ${key}`);
      return data;
    } catch (error) {
      console.error(`❌ API request failed: ${key}`, error);
      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('🧹 Cache cleared');
  }

  // Helper function to calculate median instead of average
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  private async ensureWeekMaps(): Promise<void> {
    if (this.weekMetaMap && this.weekToScoringPeriodMap) return;

    try {
      console.log('📅 Building weekMetaMap exclusively from MLB calendar');
      const season = new Date().getUTCFullYear();
      const mlbSchedule = await mlbApiService.getSeasonDates(season);
      this.weekMetaMap = buildWeekMetaMapFromMLB(mlbSchedule);
      
      this.weekToScoringPeriodMap = Object.fromEntries(
        Object.entries(this.weekMetaMap).map(([mpId, meta]) => [Number(mpId), meta.scoringPeriodIds])
      );
      console.log(`✅ weekMetaMap built from MLB calendar (${Object.keys(this.weekMetaMap).length} weeks)`);
    } catch (mlbErr) {
      console.error('❌ FATAL: Could not build week maps from MLB calendar.', mlbErr);
      throw new Error('Could not construct week maps from the MLB calendar.');
    }
  }

  private async buildWeekMapsFromData(): Promise<{
    weekToScoringPeriodMap: Record<number, number[]>;
    weekMetaMap: Record<number, any>;
  }> {
    const weekToScoringPeriodMap: Record<number, number[]> = {};
    const weekMetaMap: Record<number, any> = {};
    
    try {
      // Get available weeks from static data files
      const [weeklyStatsResponse, matchupsResponse] = await Promise.all([
        fetch('/weekly_stats.json').catch(() => null),
        fetch('/matchups.json').catch(() => null),
      ]);
      
      let availableWeeks: number[] = [];
      
             // Extract weeks from weekly stats
       if (weeklyStatsResponse?.ok) {
         const weeklyStats = await weeklyStatsResponse.json();
         const statsWeeks = [...new Set(weeklyStats.map((stat: any) => stat.week))].filter((week): week is number => typeof week === 'number');
         availableWeeks = availableWeeks.concat(statsWeeks);
       }
       
       // Extract weeks from matchups
       if (matchupsResponse?.ok) {
         const matchups = await matchupsResponse.json();
         const matchupWeeks = [...new Set(matchups.map((matchup: any) => matchup.week))].filter((week): week is number => typeof week === 'number');
         availableWeeks = availableWeeks.concat(matchupWeeks);
       }
      
      // Remove duplicates and sort
      availableWeeks = [...new Set(availableWeeks)].sort((a, b) => a - b);
      
      if (availableWeeks.length === 0) {
        console.warn('No weeks found in data files, using fallback weeks');
        availableWeeks = [105, 110]; // Fallback based on observed data
      }
      
      console.log(`📊 Found ${availableWeeks.length} weeks in data: ${availableWeeks.join(', ')}`);
      
      // Create sequential week mapping (ESPN weeks like 105-110 become weeks 1-6)
      availableWeeks.forEach((espnWeek, index) => {
        const sequentialWeek = index + 1;
        
        // Map sequential week to ESPN week
        weekToScoringPeriodMap[sequentialWeek] = [espnWeek];
        
        // Also map ESPN week to itself for direct access
        weekToScoringPeriodMap[espnWeek] = [espnWeek];
        
        // Create proper week metadata with ISO dates
        const weekStartISO = this.getWeekStartDateISO(espnWeek);
        const weekEndISO = this.getWeekEndDateISO(espnWeek);
        const weekStartLabel = this.getWeekStartDate(espnWeek);
        const weekEndLabel = this.getWeekEndDate(espnWeek);
        
        // Create scoring period IDs (7 consecutive days)
        const scoringPeriodIds: number[] = [];
        for (let i = 0; i < 7; i++) {
          scoringPeriodIds.push(espnWeek + i);
        }
        
        const label = `Week ${sequentialWeek} (${weekStartLabel} – ${weekEndLabel})`;
        
        weekMetaMap[sequentialWeek] = {
          matchupPeriodId: sequentialWeek,
          scoringPeriodIds,
          startISO: weekStartISO,
          endISO: weekEndISO,
          label,
        };
        
        weekMetaMap[espnWeek] = {
          matchupPeriodId: espnWeek,
          scoringPeriodIds,
          startISO: weekStartISO,
          endISO: weekEndISO,
          label: `ESPN Week ${espnWeek} (${weekStartLabel} – ${weekEndLabel})`,
        };
      });
      
      return { weekToScoringPeriodMap, weekMetaMap };
      
    } catch (error) {
      console.error('Failed to build week maps from data:', error);
      
      // Final fallback: create basic mapping for known weeks
      const fallbackWeeks = [105, 110];
      fallbackWeeks.forEach((espnWeek, index) => {
        const sequentialWeek = index + 1;
        weekToScoringPeriodMap[sequentialWeek] = [espnWeek];
        weekToScoringPeriodMap[espnWeek] = [espnWeek];
        
        const weekStartISO = this.getWeekStartDateISO(espnWeek);
        const weekEndISO = this.getWeekEndDateISO(espnWeek);
        const scoringPeriodIds = Array.from({length: 7}, (_, i) => espnWeek + i);
        
        weekMetaMap[sequentialWeek] = {
          matchupPeriodId: sequentialWeek,
          scoringPeriodIds,
          startISO: weekStartISO,
          endISO: weekEndISO,
          label: `Week ${sequentialWeek}`,
        };
        
        weekMetaMap[espnWeek] = {
          matchupPeriodId: espnWeek,
          scoringPeriodIds,
          startISO: weekStartISO,
          endISO: weekEndISO,
          label: `ESPN Week ${espnWeek}`,
        };
      });
      
      return { weekToScoringPeriodMap, weekMetaMap };
    }
  }

  private getWeekStartDate(espnWeek: number): string {
    // ESPN week 105 likely starts around July 1st, 2025
    // This is an approximation - in a real app you'd get this from ESPN's schedule
    const baseDate = new Date('2025-07-01'); // Season start approximation
    const weekOffset = espnWeek - 105; // Weeks since ESPN week 105
    const startDate = new Date(baseDate);
    startDate.setDate(baseDate.getDate() + (weekOffset * 7));
    
    return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private getWeekEndDate(espnWeek: number): string {
    // Get end date (6 days after start)
    const baseDate = new Date('2025-07-01');
    const weekOffset = espnWeek - 105;
    const endDate = new Date(baseDate);
    endDate.setDate(baseDate.getDate() + (weekOffset * 7) + 6);
    
    return endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private getWeekStartDateISO(espnWeek: number): string {
    // ESPN week 105 likely starts around July 1st, 2025
    // This is an approximation - in a real app you'd get this from ESPN's schedule
    const baseDate = new Date('2025-07-01'); // Season start approximation
    const weekOffset = espnWeek - 105; // Weeks since ESPN week 105
    const startDate = new Date(baseDate);
    startDate.setDate(baseDate.getDate() + (weekOffset * 7));
    
    return startDate.toISOString();
  }

  private getWeekEndDateISO(espnWeek: number): string {
    // Get end date (6 days after start)
    const baseDate = new Date('2025-07-01');
    const weekOffset = espnWeek - 105;
    const endDate = new Date(baseDate);
    endDate.setDate(baseDate.getDate() + (weekOffset * 7) + 6);
    
    return endDate.toISOString();
  }

  async getScoringPeriodIdsForWeek(weekNum: number): Promise<number[]> {
    await this.ensureWeekMaps();
    return this.weekToScoringPeriodMap?.[weekNum] || [];
  }

  async getWeekMetaMap(): Promise<Record<number, any>> {
    await this.ensureWeekMaps();
    return this.weekMetaMap || {};
  }

  async getCurrentWeek(): Promise<number> {
    await this.ensureWeekMaps();
    if (!this.weekMetaMap) {
      console.error('Cannot determine current week: weekMetaMap is not available.');
      return 1;
    }

    const now = new Date();
    // Find the first week where the end date is in the future
    for (const weekNum in this.weekMetaMap) {
      const week = this.weekMetaMap[weekNum];
      if (week.endISO && new Date(week.endISO) >= now) {
        console.log(`📍 Current week determined to be ${week.matchupPeriodId} based on date.`);
        return week.matchupPeriodId;
      }
    }

    // If no future week is found, default to the last available week
    const allWeeks = Object.keys(this.weekMetaMap).map(Number);
    const lastWeek = Math.max(...allWeeks);
    console.warn(`Could not find a current week in the future, defaulting to last week: ${lastWeek}`);
    return lastWeek;
  }

  async getLeagueInfo(): Promise<any> {
    return this.fetchWithCache('league-info', async () => {
      let espnData = null;
      let fallbackData = null;
      let currentWeek = null;
      
      // Try to get current week first (this is most critical)
      try {
        currentWeek = await this.getCurrentWeek();
      } catch (error) {
        console.warn('Could not determine current week, using fallback:', error);
        currentWeek = 110; // Fallback to most recent known week
      }
      
      // Try ESPN API first
      try {
        espnData = await this.espnService.getLeagueInfo();
        console.log('✅ Successfully fetched league info from ESPN API');
      } catch (error) {
        console.warn('📡 ESPN API failed for league info, will use fallback:', error);
      }
      
      // Try fallback data
      try {
        const response = await fetch('/league_info.json');
        if (response.ok) {
          fallbackData = await response.json();
          console.log('✅ Loaded fallback league data');
        }
      } catch (error) {
        console.warn('📄 Fallback league data also failed:', error);
      }
      
      // Combine the best available data
      if (espnData) {
        return {
          id: espnData.id,
          name: espnData.name,
          season: espnData.season,
          size: Array.isArray(espnData?.teams) ? espnData.teams.length : 0,
          currentMatchupPeriod: currentWeek,
          scoringPeriodId: espnData.scoringPeriodId || currentWeek,
          teams: Array.isArray(espnData?.teams) ? espnData.teams.map(team => ({
            id: team.id,
            location: team.location || '',
            nickname: team.nickname || '',
            name: (team.location && team.nickname)
              ? `${team.location} ${team.nickname}`.trim()
              : team.name || '',
            owner: team.owner,
            wins: team.wins,
            losses: team.losses,
            ties: team.ties
          })) : [],
          dataSource: 'ESPN_API'
        };
      } else if (fallbackData) {
        return {
          ...fallbackData,
          size: fallbackData.total_teams || 10,
          currentMatchupPeriod: currentWeek,
          scoringPeriodId: fallbackData.scoring_period || currentWeek,
          teams: [], // Will be populated by separate getTeams() call
          dataSource: 'FALLBACK'
        };
      } else {
        // Last resort: create minimal league info
        console.warn('🚨 No league data available, creating minimal info');
        return {
          id: 24414,
          name: 'Fantasy Baseball League',
          season: 2025,
          size: 10,
          currentMatchupPeriod: currentWeek,
          scoringPeriodId: currentWeek,
          teams: [],
          dataSource: 'MINIMAL'
        };
      }
    });
  }

  async getTeams(): Promise<any[]> {
    return this.fetchWithCache('teams', async () => {
      try {
        const leagueInfo = await this.espnService.getLeagueInfo();
        if (Array.isArray(leagueInfo?.teams) && leagueInfo.teams.length > 0) {
          const espnTeams = leagueInfo.teams.map(team => ({
            id: team.id,
            location: team.location || '',
            nickname: team.nickname || '',
            name: (team.location && team.nickname)
              ? `${team.location} ${team.nickname}`.trim()
              : team.name || '',
            abbrev: team.abbrev || team.name?.slice(0,3)?.toUpperCase() || '',
            owner: team.owner,
            wins: team.wins,
            losses: team.losses,
            ties: team.ties,
            logo: '',
            record: `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`
          }));

          const allValid = espnTeams.every(t => t.name && !/^Team \d+$/.test(t.name) && t.owner && t.owner !== 'Unknown Owner');
          if (allValid) return espnTeams;
          console.warn('ESPN teams appear generic; falling back to teams.json');

          // Try fallback teams.json when ESPN names are generic
          try {
            const response = await fetch('/teams.json');
            if (response.ok) {
              const fallbackData = await response.json();
              console.log('🔄 Using fallback team data');
              return fallbackData;
            }
          } catch (fallbackError) {
            console.error('Fallback data also failed:', fallbackError);
          }
        }
      } catch (error) {
        console.error('Failed to fetch teams from ESPN:', error);
        // Fallback to static data when ESPN API fails
        try {
          const response = await fetch('/teams.json');
          if (response.ok) {
            const fallbackData = await response.json();
            console.log('🔄 Using fallback team data');
            return fallbackData;
          }
        } catch (fallbackError) {
          console.error('Fallback data also failed:', fallbackError);
        }
        throw error;
      }

      // Final safety: if we reach here, return minimal placeholder teams
      console.warn('🚨 No team data available, creating minimal teams');
      return Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        location: '',
        nickname: '',
        name: `Team ${i + 1}`,
        owner: 'Unknown Owner',
        wins: 0,
        losses: 0,
        ties: 0,
        logo: '',
        record: '0-0'
      }));
    });
  }

  async getTeamStandings(): Promise<any[]> {
    // Clear cache to ensure fresh data
    this.cache.delete('standings');
    
    return this.fetchWithCache('standings', async () => {
      let espnData = null;
      let fallbackData = null;
      
      // Try ESPN API first
      try {
        console.log('🔍 Attempting to fetch standings from ESPN API...');
        const leagueInfo = await this.espnService.getLeagueInfo();
        console.log('📊 ESPN API Response - Teams count:', leagueInfo?.teams?.length || 0);
        console.log('📊 ESPN API Response - Divisions:', leagueInfo?.divisions);
        
        if (Array.isArray(leagueInfo?.teams) && leagueInfo.teams.length > 0) {
          console.log('✅ ESPN API returned teams:', leagueInfo.teams.length);
          
          // Create a division lookup map
          const divisionMap = new Map<number, string>();
          if (leagueInfo.divisions) {
            leagueInfo.divisions.forEach((division: any) => {
              divisionMap.set(division.id, division.name);
            });
          }
          
          espnData = leagueInfo.teams.map(team => ({
            id: team.id,
            name: team.name,
            abbrev: team.abbrev || team.name?.slice(0,3)?.toUpperCase(),
            owner: team.owner,
            wins: team.wins,
            losses: team.losses,
            ties: team.ties,
            teamId: team.id,
            teamName: team.name,
            divisionId: team.divisionId,
            divisionName: team.divisionName || (team.divisionId !== undefined ? divisionMap.get(team.divisionId) : undefined),
            winPercentage: team.wins / Math.max(team.wins + team.losses, 1),
            pointsFor: team.wins * 100, // Placeholder
            pointsAgainst: team.losses * 100, // Placeholder
            record: `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`,
            dataSource: 'ESPN_API'
          }));
          
          console.log('✅ Successfully fetched team standings from ESPN API');
          console.log('📊 Sample team with division data:', espnData[0]);
          
        } else {
          console.warn('❌ ESPN API returned no teams or invalid structure');
        }
      } catch (error) {
        console.error('📡 ESPN API failed for team standings:', error);
      }
      
      // Try fallback data if ESPN failed
      if (!espnData) {
        console.log('📄 Falling back to static files...');
        try {
          // First try to use teams.json directly since it has better data structure
          const teamsResponse = await fetch('/teams.json');
          if (teamsResponse.ok) {
            const teamsData = await teamsResponse.json();
            console.log('✅ Using teams.json data directly');
            
            fallbackData = teamsData.map((team: any) => ({
              id: team.id,
              name: team.name,
              owner: team.owner,
              wins: team.wins,
              losses: team.losses,
              ties: team.ties || 0,
              teamId: team.id,
              teamName: team.name,
              divisionId: team.divisionId, // Include division data from fallback if available
              divisionName: team.divisionName,
              winPercentage: team.wins / Math.max(team.wins + team.losses, 1),
              pointsFor: team.points_for || 0,
              pointsAgainst: team.points_against || 0,
              record: `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`,
              dataSource: 'TEAMS_JSON'
            }));
          } else {
            // Fall back to standings.json if teams.json fails
            const [standingsResponse, teamsResponse] = await Promise.all([
              fetch('/standings.json'),
              fetch('/teams.json')
            ]);
            
            if (standingsResponse.ok && teamsResponse.ok) {
              const standingsData = await standingsResponse.json();
              const teamsData = await teamsResponse.json();
              
              console.log('✅ Using fallback standings data');
              fallbackData = standingsData.map((team: any) => {
                const teamInfo = teamsData.find((t: any) => t.id === team.team_id);
                return {
                  ...team,
                  id: team.team_id,
                  name: team.team_name,
                  teamId: team.team_id,
                  teamName: team.team_name,
                  owner: teamInfo?.owner || 'Unknown',
                  divisionId: teamInfo?.divisionId, // Include division data from fallback if available
                  divisionName: teamInfo?.divisionName,
                  winPercentage: team.win_percentage,
                  pointsFor: team.points_for,
                  pointsAgainst: team.points_against,
                  dataSource: 'FALLBACK'
                };
              });
            }
          }
        } catch (fallbackError) {
          console.warn('📄 Fallback standings data also failed:', fallbackError);
        }
      }
      
      // Return the best available data
      if (espnData) {
        console.log('🎯 Returning ESPN API data - first team:', espnData[0]?.name);
        return espnData;
      } else if (fallbackData && fallbackData.length > 0) {
        console.log('🎯 Returning fallback data - first team:', fallbackData[0]?.name);
        return fallbackData;
      } else {
        // Last resort: create minimal team data
        console.warn('🚨 No standings data available, creating minimal teams');
        return Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          teamId: i + 1,
          teamName: `Team ${i + 1}`,
          name: `Team ${i + 1}`,
          owner: 'Unknown',
          wins: 0,
          losses: 0,
          ties: 0,
          divisionId: i < 5 ? 0 : 1, // Assign half to East (0) and half to West (1)
          divisionName: i < 5 ? 'East' : 'West',
          winPercentage: 0,
          record: '0-0',
          pointsFor: 0,
          pointsAgainst: 0,
          dataSource: 'MINIMAL'
        }));
      }
    });
  }

  async getTeamRoster(teamId: number, week?: number): Promise<any[]> {
    const key = `roster-${teamId}${week ? `-w${week}` : ''}`;

    return this.fetchWithCache(key, async () => {
      if (week === undefined) {
        throw new Error('A week must be provided to fetch a team roster.');
      }
      
      await this.ensureWeekMaps();
      const currentWeek = await this.getCurrentWeek();
      
      if (!this.weekMetaMap) {
        throw new Error('Cannot get roster: week meta map is not available.');
      }

      const weekMeta = this.weekMetaMap[week];
      if (!weekMeta?.scoringPeriodIds || weekMeta.scoringPeriodIds.length === 0) {
        console.error(`No scoring periods found for week ${week}.`);
        return [];
      }
      
      let representativeScoringPeriodId: number;
      
      // If viewing the current week, use the last scoring period (latest day). Otherwise, use the first day of the selected week.
      if (week === currentWeek) {
        representativeScoringPeriodId = weekMeta.scoringPeriodIds[weekMeta.scoringPeriodIds.length - 1];
        console.log(`Current week view: using latest scoringPeriodId: ${representativeScoringPeriodId}`);
      } else {
        representativeScoringPeriodId = weekMeta.scoringPeriodIds[0];
        console.log(`Past/Future week view: using first day's scoringPeriodId: ${representativeScoringPeriodId}`);
      }
      
      console.log(`Fetching roster for team ${teamId}, week ${week} (using scoringPeriodId: ${representativeScoringPeriodId})`);
      
      const rosterData = await this.espnService.getAllTeamRosters(representativeScoringPeriodId);
      const teamRoster = rosterData.find(r => r.teamId === teamId);
      
      if (!teamRoster) {
        console.warn(`Roster for team ${teamId} not found in week ${week}`);
        return [];
      }
      return teamRoster.players;
    });
  }

  /**
   * Fetch the roster for a specific team and scoringPeriodId (day).
   */
  async getTeamRosterForDay(teamId: number, scoringPeriodId: number): Promise<any[]> {
    const key = `roster-${teamId}-spid${scoringPeriodId}`;
    return this.fetchWithCache(key, async () => {
      const rosterData = await this.espnService.getAllTeamRosters(scoringPeriodId);
      const teamRoster = rosterData.find(r => r.teamId === teamId);
      if (!teamRoster) {
        console.warn(`Roster for team ${teamId} not found for scoringPeriodId ${scoringPeriodId}`);
        return [];
      }
      return teamRoster.players;
    });
  }

  // Helper to map week number (matchupPeriodId) to scoringPeriodId using ESPN settings
  async getScoringPeriodIdForWeek(week: number): Promise<number | null> {
    try {
      const leagueInfo = await this.espnService.getLeagueInfo();
      if (Array.isArray(leagueInfo.schedule)) {
        const period = leagueInfo.schedule.find((p: any) => p.matchupPeriodId === week);
        if (period) return period.scoringPeriodId;
      }
      return null;
    } catch (err) {
      console.error('Failed to map week to scoringPeriodId:', err);
      return null;
    }
  }

  async getWeeklyStats(week?: number): Promise<any> {
    console.log('🔥 [getWeeklyStats] FUNCTION CALLED for week', week);
    console.log('🔥 [getWeeklyStats] Using NEW FUZZY MATCHING approach!');
    
    const cacheKey = `weekly-stats-fuzzy-${week || 'current'}`;
    this.cache.delete(cacheKey);
    
    return this.fetchWithCache(cacheKey, async () => {
      try {
        // Get the actual week metadata to use real dates
        const targetWeek = week || await this.getCurrentWeek();
        console.log(`🔥 [getWeeklyStats] Target week: ${targetWeek}`);
        
        // Get week metadata to understand the actual dates
        const weekMetaMap = await this.getWeekMetaMap();
        const weekMeta = weekMetaMap[targetWeek];
        
        if (!weekMeta) {
          console.error(`🔥 [getWeeklyStats] No metadata found for week ${targetWeek}`);
          return { week: targetWeek, teamStats: {}, note: 'No week metadata found' };
        }
        
        console.log(`🔥 [getWeeklyStats] Week ${targetWeek} metadata:`, weekMeta);
        const scoringIds = weekMeta.scoringPeriodIds;
        console.log(`🔥 [getWeeklyStats] Scoring period IDs for week ${targetWeek}:`, scoringIds);
        
        const teams = await this.getTeams();
        console.log(`🔥 [getWeeklyStats] Loaded ${teams.length} teams`);
        const teamStats: Record<number, any> = {};
        
        // Calculate the actual dates for this week
        const weekDates: string[] = [];
        if (weekMeta.startISO) {
          const startDate = new Date(weekMeta.startISO);
          for (let i = 0; i < scoringIds.length; i++) {
            const date = new Date(startDate);
            date.setUTCDate(startDate.getUTCDate() + i);
            weekDates.push(date.toISOString().slice(0, 10));
          }
        } else {
          // Fallback: use 2025 season dates for testing
          console.warn(`🔥 [getWeeklyStats] No start date for week ${targetWeek}, using fallback dates`);
          // Use dates from July 2025 when the season would be active
          weekDates.push('2025-07-07', '2025-07-08', '2025-07-09', '2025-07-10', '2025-07-11', '2025-07-12', '2025-07-13');
        }
        console.log(`🔥 [getWeeklyStats] Week dates:`, weekDates);
        
        for (const team of teams) {
          console.log(`🔥 [getWeeklyStats] Processing team ${team.id} (${team.name})`);
          const agg = {
            runs: 0, homeRuns: 0, rbis: 0, stolenBases: 0, battingAverage: 0, hits: 0,
            strikeouts: 0, wins: 0, saves: 0, era: 0, whip: 0, qualityStarts: 0
          };
          let abTotal = 0, hTotal = 0, eraER = 0, eraIP = 0, whipNum = 0, whipIP = 0;
          let totalMatches = 0;
          
          for (let dayIndex = 0; dayIndex < scoringIds.length; dayIndex++) {
            const scoringPeriodId = scoringIds[dayIndex];
            const dateStr = weekDates[dayIndex];
            
            console.log(`🔥 [getWeeklyStats] Day ${dayIndex + 1}/7: scoringPeriodId ${scoringPeriodId} -> ${dateStr}`);
            
            // Get ESPN roster for this day
            const roster = await this.getTeamRosterForDay(team.id, scoringPeriodId);
            console.log(`🔥 [getWeeklyStats] Team ${team.id} roster: ${roster.length} players`);
            
            const starters = roster.filter((p: any) => p.lineupSlotId !== 16 && p.lineupSlotId !== 17 && p.status === 'ACTIVE');
            console.log(`🔥 [getWeeklyStats] Team ${team.id} starters: ${starters.length} players`);
            
            if (starters.length > 0) {
              // Convert ESPN players to our interface
              const espnPlayers: ESPNPlayer[] = starters.map(p => ({
                playerId: p.playerId,
                fullName: p.fullName || p.name || 'Unknown',
                teamAbbrev: p.teamAbbrev || p.team?.abbreviation,
                teamId: p.teamId,
                position: p.position,
                lineupSlotId: p.lineupSlotId
              }));
              
              console.log(`🔥 [getWeeklyStats] Fetching MLB players for ${dateStr}`);
              const mlbPlayersRaw = await mlbStatService.getMLBPlayersForDate(dateStr);
              console.log(`🔥 [getWeeklyStats] Found ${mlbPlayersRaw.length} MLB players on ${dateStr}`);
              
              // Convert to our interface
              const mlbPlayers: MLBPlayer[] = mlbPlayersRaw.map(p => ({
                id: p.id,
                fullName: p.fullName,
                team: p.team,
                position: p.position,
                stats: p.stats
              }));
              
              if (mlbPlayers.length > 0) {
                console.log(`🔥 [getWeeklyStats] Starting fuzzy matching for ${espnPlayers.length} ESPN players vs ${mlbPlayers.length} MLB players`);
                const matches = await playerMatcher.matchPlayers(espnPlayers, mlbPlayers);
                
                // Aggregate stats from successful matches
                for (const match of matches) {
                  if (match.mlbPlayer && match.confidence >= 0.5) { // Only use matches with decent confidence
                    const stats = match.mlbPlayer.stats;
                    if (stats) {
                      // Add batting stats
                      if (stats.batting) {
                        agg.runs += Number(stats.batting.runs || 0);
                        agg.homeRuns += Number(stats.batting.homeRuns || 0);
                        agg.rbis += Number(stats.batting.rbi || 0);
                        agg.stolenBases += Number(stats.batting.stolenBases || 0);
                        agg.hits += Number(stats.batting.hits || 0);
                        abTotal += Number(stats.batting.atBats || 0);
                        hTotal += Number(stats.batting.hits || 0);
                      }
                      
                      // Add pitching stats
                      if (stats.pitching) {
                        agg.strikeouts += Number(stats.pitching.strikeOuts || 0);
                        agg.wins += Number(stats.pitching.wins || 0);
                        agg.saves += Number(stats.pitching.saves || 0);
                        
                        const ip = Number(stats.pitching.inningsPitched || 0);
                        const er = Number(stats.pitching.earnedRuns || 0);
                        const h = Number(stats.pitching.hits || 0);
                        const bb = Number(stats.pitching.baseOnBalls || 0);
                        
                        eraIP += ip;
                        eraER += er;
                        whipNum += h + bb;
                        whipIP += ip;
                        
                        // Quality start check
                        if (ip >= 6 && er <= 3) agg.qualityStarts += 1;
                      }
                      
                      totalMatches++;
                      console.log(`🔥 [getWeeklyStats] ✅ Used stats from ${match.espnPlayer.fullName} → ${match.mlbPlayer.fullName} (${(match.confidence * 100).toFixed(1)}%)`);
                    }
                  } else if (match.mlbPlayer) {
                    console.log(`🔥 [getWeeklyStats] ⚠️ Low confidence match: ${match.espnPlayer.fullName} → ${match.mlbPlayer.fullName} (${(match.confidence * 100).toFixed(1)}%)`);
                  } else {
                    console.log(`🔥 [getWeeklyStats] ❌ No match: ${match.espnPlayer.fullName}`);
                  }
                }
              } else {
                console.log(`🔥 [getWeeklyStats] No MLB players found for ${dateStr}`);
              }
            }
          }
          
          // Calculate final averages
          agg.battingAverage = abTotal ? hTotal / abTotal : 0;
          agg.era = eraIP ? (eraER * 9) / eraIP : 0;
          agg.whip = whipIP ? whipNum / whipIP : 0;
          teamStats[team.id] = agg;
          
          console.log(`🔥 [getWeeklyStats] Team ${team.id} final: ${totalMatches} matches, totals:`, agg);
        }
        
        console.log('🔥 [getWeeklyStats] Final result:', { week: targetWeek, teamStats, note: 'Computed using fuzzy matching' });
        return { week: targetWeek, teamStats, note: 'Computed using fuzzy matching' };
      } catch (error) {
        console.error('🔥 [getWeeklyStats] ERROR:', error);
        return {
          week: week || 1,
          teamStats: {},
          note: 'Error loading weekly statistics'
        };
      }
    });
  }

  async getExpectedStats(teamId: number, weeks: number[] = []): Promise<any> {
    return this.fetchWithCache(`expected-stats-${teamId}-${weeks.join(',')}`, async () => {
      try {
        // Get historical data for the last 4 weeks
        const historicalWeeks = weeks.length > 0 ? weeks : [11, 12, 13, 14];
        const historicalStats = [];
        
        for (const week of historicalWeeks) {
          try {
            const weeklyData = await this.getWeeklyStats(week);
            if (weeklyData.teamStats[teamId]) {
              historicalStats.push(weeklyData.teamStats[teamId]);
            }
          } catch (error) {
            console.error(`Failed to get stats for week ${week}:`, error);
          }
        }
        
        if (historicalStats.length === 0) {
          // Defensive: no data available for expected stats calculation
          return {
            runs: 0,
            homeRuns: 0,
            rbis: 0,
            stolenBases: 0,
            battingAverage: 0,
            hits: 0,
            strikeouts: 0,
            wins: 0,
            saves: 0,
            era: 0,
            whip: 0,
            qualityStarts: 0
          };
        }
        
        // Calculate median for each stat
        const expectedStats = {
          runs: this.calculateMedian(historicalStats.map(s => s.runs)),
          homeRuns: this.calculateMedian(historicalStats.map(s => s.homeRuns)),
          rbis: this.calculateMedian(historicalStats.map(s => s.rbis)),
          stolenBases: this.calculateMedian(historicalStats.map(s => s.stolenBases)),
          battingAverage: this.calculateMedian(historicalStats.map(s => s.battingAverage)),
          hits: this.calculateMedian(historicalStats.map(s => s.hits)),
          strikeouts: this.calculateMedian(historicalStats.map(s => s.strikeouts)),
          wins: this.calculateMedian(historicalStats.map(s => s.wins)),
          saves: this.calculateMedian(historicalStats.map(s => s.saves)),
          era: this.calculateMedian(historicalStats.map(s => s.era)),
          whip: this.calculateMedian(historicalStats.map(s => s.whip)),
          qualityStarts: this.calculateMedian(historicalStats.map(s => s.qualityStarts))
        };
        
        return expectedStats;
              } catch (error) {
        console.error(`Failed to calculate expected stats for team ${teamId}:`, error);
        // Fallback to static data when APIs fail
        try {
          const response = await fetch('/weekly_stats.json');
          if (response.ok) {
            const fallbackData = await response.json();
            console.log('🔄 Using fallback data for expected stats calculation');
            
            // Get historical data for the team
            const teamStats = fallbackData.filter((stat: any) => stat.team_id === teamId);
            
            if (teamStats.length > 0) {
              const historicalWeeks = weeks.length > 0 ? weeks : [11, 12, 13, 14];
              const historicalStats = teamStats.filter((stat: any) => 
                historicalWeeks.includes(stat.week)
              );
              
              if (historicalStats.length > 0) {
                const expectedStats = {
                  runs: this.calculateMedian(historicalStats.map((s: any) => s.runs)),
                  homeRuns: this.calculateMedian(historicalStats.map((s: any) => s.home_runs)),
                  rbis: this.calculateMedian(historicalStats.map((s: any) => s.rbis)),
                  stolenBases: this.calculateMedian(historicalStats.map((s: any) => s.stolen_bases)),
                  battingAverage: this.calculateMedian(historicalStats.map((s: any) => s.avg)),
                  hits: this.calculateMedian(historicalStats.map((s: any) => s.hits)),
                  strikeouts: this.calculateMedian(historicalStats.map((s: any) => s.strikeouts)),
                  wins: this.calculateMedian(historicalStats.map((s: any) => s.wins)),
                  saves: this.calculateMedian(historicalStats.map((s: any) => s.saves)),
                  era: this.calculateMedian(historicalStats.map((s: any) => s.era)),
                  whip: this.calculateMedian(historicalStats.map((s: any) => s.whip)),
                  qualityStarts: this.calculateMedian(historicalStats.map((s: any) => s.quality_starts))
                };
                return expectedStats;
              }
            }
          }
        } catch (fallbackError) {
          console.error('Fallback expected stats data also failed:', fallbackError);
        }
        throw error;
      }
    });
  }

  async getMatchups(week?: number): Promise<any[]> {
    return this.fetchWithCache(`matchups-${week || 'current'}`, async () => {
      const targetWeek = week || await this.getCurrentWeek();

      // 1️⃣  Attempt to fetch live matchups from ESPN API via fantasyAPI helper
      try {
        const liveMatchups = await fantasyAPI.getMatchups(targetWeek);
        if (Array.isArray(liveMatchups) && liveMatchups.length > 0) {
          console.log(`⚔️ Loaded ${liveMatchups.length} live matchups for week ${targetWeek}`);

          // Normalise to the structure expected by consumers (home/away + team1Id/team2Id)
          return liveMatchups.map((m: any) => ({
            id: `${m.homeTeamId}-${m.awayTeamId}`,
            week: targetWeek,
            team1Id: m.homeTeamId,
            team2Id: m.awayTeamId,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeScore: m.homeScore || 0,
            awayScore: m.awayScore || 0,
            status: 'IN_PROGRESS',
          }));
        }
      } catch (err) {
        console.warn('⚔️ ESPN API matchups fetch failed, falling back to static JSON:', err);
      }

      // 2️⃣  Fallback to bundled JSON file (typically used in demo/dev mode)
      try {
        const response = await fetch('/matchups.json');
        if (!response.ok) throw new Error('Failed to fetch matchups.json');

        const allMatchups = await response.json();
        console.log('⚔️ Loaded fallback matchups data');

        // Extract available ESPN weeks from the JSON
        const availableWeeks = [...new Set(allMatchups.map((m: any) => m.week))] as number[];
        availableWeeks.sort((a, b) => b - a);

        // Choose the best week to use from the fallback data
        let espnWeek = availableWeeks[0];
        if (availableWeeks.includes(targetWeek)) {
          espnWeek = targetWeek;
        } else {
          const closest = availableWeeks.reduce((prev, curr) =>
            Math.abs(curr - targetWeek) < Math.abs(prev - targetWeek) ? curr : prev
          );
          espnWeek = closest;
        }

        const weekMatchups = allMatchups.filter((m: any) => m.week === espnWeek);

        return weekMatchups.map((matchup: any) => ({
          id: `${matchup.home_team?.id}-${matchup.away_team?.id}`,
          week: targetWeek,
          team1Id: matchup.home_team?.id,
          team2Id: matchup.away_team?.id,
          homeTeamId: matchup.home_team?.id,
          awayTeamId: matchup.away_team?.id,
          homeScore: matchup.home_team?.score || 0,
          awayScore: matchup.away_team?.score || 0,
          status: matchup.status || 'IN_PROGRESS',
        }));
      } catch (error) {
        console.error('Failed to load fallback matchups:', error);
        return [];
      }
    });
  }

  async getPlayersStats(): Promise<any[]> {
    return this.fetchWithCache('players-stats', async () => {
      try {
        // Get all teams and their rosters
        const teams = await this.getTeams();
        const allPlayers = [];
        const weeklyStats = await this.getWeeklyStats();
        for (const team of teams) {
          const week = await getCurrentWeekSafe(this);
          const roster = await this.getTeamRoster(team.id, week);
          const teamStats = weeklyStats.teamStats[team.id] || {};
          for (const player of roster) {
            if (!player.playerId) {
              if (import.meta.env.VITE_DEBUG === 'true') {
                console.warn(`Skipping player with missing ID on team ${team.name}:`, player.name);
              }
              continue;
            }
            allPlayers.push({
              ...player,
              team: team.name,
              stats: teamStats // Attach team stats to each player
            });
          }
        }
        return allPlayers;
      } catch (error) {
        console.error('Failed to fetch players stats:', error);
        // Fallback to static data when APIs fail
        try {
          const response = await fetch('/players_stats.json');
          if (response.ok) {
            const fallbackData = await response.json();
            console.log('🔄 Using fallback players stats data');
            return fallbackData;
          }
        } catch (fallbackError) {
          console.error('Fallback players stats data also failed:', fallbackError);
        }
        throw error;
      }
    });
  }

  async getPlayerPerformance(): Promise<any[]> {
    return this.fetchWithCache('player-performance', async () => {
      try {
        const weeklyStats = await this.getWeeklyStats();
        const allPlayers = [];
        const standings = await this.getTeamStandings();
        
        for (const team of standings) {
          const week = await getCurrentWeekSafe(this);
          const roster = await this.getTeamRoster(team.id, week);
          const teamStats = weeklyStats.teamStats[team.id] || {};
          
          for (const player of roster) {
            if (!player.playerId || typeof player.playerId !== 'number' || isNaN(player.playerId)) {
              console.warn(`Skipping player with invalid ID on team ${team.name}:`, player.name, player.playerId);
              continue;
            }
            
            // Calculate a performance score from team stats (since no per-player stats)
            const performanceScore = (teamStats.runs || 0) + (teamStats.homeRuns || 0) * 4 + (teamStats.rbis || 0) + (teamStats.stolenBases || 0) * 2;
            
            allPlayers.push({
              ...player,
              teamName: team.name,
              performanceScore,
              stats: {
                runs: teamStats.runs || 0,
                home_runs: teamStats.homeRuns || 0,
                rbis: teamStats.rbis || 0,
                stolen_bases: teamStats.stolenBases || 0,
                avg: teamStats.battingAverage || 0,
                hits: teamStats.hits || 0,
                strikeouts: teamStats.strikeouts || 0,
                wins: teamStats.wins || 0,
                saves: teamStats.saves || 0,
                era: teamStats.era || 0,
                whip: teamStats.whip || 0,
                quality_starts: teamStats.qualityStarts || 0
              }
            });
          }
        }
        
        // Sort by performance score
        allPlayers.sort((a, b) => b.performanceScore - a.performanceScore);
        console.log(`✅ Loaded performance data for ${allPlayers.length} players`);
        return allPlayers;
        
      } catch (error) {
        console.error('Failed to fetch player performance:', error);
        return [];
      }
    });
  }

  private calculatePlayerTrend(player: any): 'up' | 'down' | 'stable' {
    // This would require historical data comparison
    // For now, return stable as default
    return 'stable';
  }

  private calculateConsistencyScore(player: any): number {
    // This would require variance calculation from historical data
    // For now, return a default score
    return 0.5;
  }

  async getTransactions(teamId?: number): Promise<any[]> {
    return this.fetchWithCache(`transactions-${teamId || 'all'}`, async () => {
      try {
        const response = await fetch('/transactions.json');
        if (!response.ok) throw new Error('Failed to fetch transactions data');
        
        const allTransactions = await response.json();
        console.log('📋 Loaded transactions data');
        
        // Filter by team if specified
        let filteredTransactions = allTransactions;
        if (teamId !== undefined) {
          filteredTransactions = allTransactions.filter((transaction: any) => transaction.team_id === teamId);
        }
        
        // Transform to expected format
        const transactions = filteredTransactions.map((transaction: any) => ({
          id: transaction.id,
          type: transaction.type,
          teamId: transaction.team_id,
          teamName: transaction.team_name,
          playerName: transaction.player_name,
          position: transaction.position,
          mlbTeam: transaction.mlb_team,
          date: transaction.date,
          week: transaction.week,
          description: transaction.description,
          waiverPriority: transaction.waiver_priority,
          tradePartnerId: transaction.trade_partner_id,
          tradePartnerName: transaction.trade_partner_name
        }));
        
        console.log(`✅ Loaded ${transactions.length} transactions${teamId ? ` for team ${teamId}` : ''}`);
        return transactions;
        
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
        return [];
      }
    });
  }

  async testMLBStats(): Promise<void> {
    console.log('🔍 [testMLBStats] Testing MLB API integration...');
    
    // Try multiple dates from 2025 season to find one with games
    const testDates = [
      '2025-09-15', // Recent regular season
      '2025-08-15', // Mid-season
      '2025-07-15', // Earlier season
      '2025-06-15', // Early season
      '2025-05-15'  // Very early season
    ];
    
    let foundGames = false;
    
    for (const testDate of testDates) {
      console.log(`🔍 [testMLBStats] Testing with date: ${testDate}`);
      
      try {
        // Test the direct MLB API first
        const mlbUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${testDate}&hydrate=team,linescore,metadata,stats&gameTypes=R`;
        console.log(`🔍 [testMLBStats] Testing direct MLB API: ${mlbUrl}`);
        
        const directResponse = await fetch(mlbUrl);
        console.log(`🔍 [testMLBStats] Direct MLB API response status: ${directResponse.status}`);
        
        if (directResponse.ok) {
          const directData = await directResponse.json();
          console.log(`🔍 [testMLBStats] Number of dates in response: ${directData.dates?.length || 0}`);
          if (directData.dates && directData.dates.length > 0) {
            const gamesCount = directData.dates[0].games?.length || 0;
            console.log(`🔍 [testMLBStats] Number of games on ${testDate}: ${gamesCount}`);
            
            if (gamesCount > 0) {
              foundGames = true;
              console.log(`🔍 [testMLBStats] Found games on ${testDate}! Testing player extraction...`);
              
              // Test our new MLB players service
              const mlbPlayers = await mlbStatService.getMLBPlayersForDate(testDate);
              console.log(`🔍 [testMLBStats] Found ${mlbPlayers.length} MLB players on ${testDate}`);
              
              if (mlbPlayers.length > 0) {
                const samplePlayer = mlbPlayers[0];
                console.log(`🔍 [testMLBStats] Sample MLB player:`, samplePlayer);
              }
              break;
            }
          }
        } else {
          console.error(`🔍 [testMLBStats] Direct MLB API failed with status: ${directResponse.status}`);
        }
      } catch (error) {
        console.error(`🔍 [testMLBStats] Error testing date ${testDate}:`, error);
      }
    }
    
    if (!foundGames) {
      console.error('🔍 [testMLBStats] No games found on any test dates - MLB season might be over or API issues');
    }
  }

  async testFuzzyMatching(): Promise<void> {
    console.log('🎯 [testFuzzyMatching] Testing fuzzy player matching...');
    
    try {
      // Get a sample team roster
      const teams = await this.getTeams();
      if (teams.length === 0) {
        console.error('🎯 [testFuzzyMatching] No teams found');
        return;
      }
      
      const firstTeam = teams[0];
      console.log(`🎯 [testFuzzyMatching] Testing with team: ${firstTeam.name} (ID: ${firstTeam.id})`);
      
      // Get roster for a recent scoring period
      const roster = await this.getTeamRosterForDay(firstTeam.id, 1);
      const starters = roster.filter((p: any) => p.lineupSlotId !== 16 && p.lineupSlotId !== 17 && p.status === 'ACTIVE');
      console.log(`🎯 [testFuzzyMatching] Found ${starters.length} starters`);
      
      if (starters.length === 0) {
        console.error('🎯 [testFuzzyMatching] No starters found');
        return;
      }
      
      // Convert to ESPN player format
      const espnPlayers: ESPNPlayer[] = starters.slice(0, 5).map(p => ({ // Test with first 5 players
        playerId: p.playerId,
        fullName: p.fullName || p.name || 'Unknown',
        teamAbbrev: p.teamAbbrev || p.team?.abbreviation,
        teamId: p.teamId,
        position: p.position,
        lineupSlotId: p.lineupSlotId
      }));
      
      console.log(`🎯 [testFuzzyMatching] ESPN players to match:`, espnPlayers.map(p => `${p.fullName} (${p.teamAbbrev})`));
      
      // Try multiple dates from 2025 season to find one with games and players
      const testDates = [
        '2025-09-15', // Recent regular season
        '2025-08-15', // Mid-season
        '2025-07-15', // Earlier season
        '2025-06-15', // Early season
        '2025-05-15'  // Very early season
      ];
      
      let foundPlayers = false;
      
      for (const testDate of testDates) {
        console.log(`🎯 [testFuzzyMatching] Trying date: ${testDate}`);
        
        const mlbPlayersRaw = await mlbStatService.getMLBPlayersForDate(testDate);
        const mlbPlayers: MLBPlayer[] = mlbPlayersRaw.map(p => ({
          id: p.id,
          fullName: p.fullName,
          team: p.team,
          position: p.position,
          stats: p.stats
        }));
        
        console.log(`🎯 [testFuzzyMatching] Found ${mlbPlayers.length} MLB players for ${testDate}`);
        
        if (mlbPlayers.length > 0) {
          foundPlayers = true;
          console.log(`🎯 [testFuzzyMatching] Found MLB players on ${testDate}! Testing fuzzy matching...`);
          
          // Perform fuzzy matching
          const matches = await playerMatcher.matchPlayers(espnPlayers, mlbPlayers);
          
          console.log(`🎯 [testFuzzyMatching] Matching results:`);
          for (const match of matches) {
            if (match.mlbPlayer) {
              console.log(`✅ ${match.espnPlayer.fullName} → ${match.mlbPlayer.fullName} (${(match.confidence * 100).toFixed(1)}%)`);
              if (match.warnings?.length) {
                console.log(`   ⚠️ ${match.warnings.join(', ')}`);
              }
            } else {
              console.log(`❌ ${match.espnPlayer.fullName} → No match found`);
            }
          }
          break;
        }
      }
      
      if (!foundPlayers) {
        console.error('🎯 [testFuzzyMatching] No MLB players found for any test date');
      }
    } catch (error) {
      console.error('🎯 [testFuzzyMatching] Error:', error);
    }
  }

  async debugWeekDates(): Promise<void> {
    console.log('📅 [debugWeekDates] Analyzing week date calculations...');
    
    try {
      const weekMetaMap = await this.getWeekMetaMap();
      const currentWeek = await this.getCurrentWeek();
      
      console.log(`📅 [debugWeekDates] Current week: ${currentWeek}`);
      console.log(`📅 [debugWeekDates] Available weeks:`, Object.keys(weekMetaMap).map(Number).sort((a, b) => a - b));
      
      // Show details for current week and a few around it
      const weeksToShow = [currentWeek - 1, currentWeek, currentWeek + 1].filter(w => weekMetaMap[w]);
      
      for (const weekNum of weeksToShow) {
        const meta = weekMetaMap[weekNum];
        console.log(`📅 [debugWeekDates] Week ${weekNum}:`, {
          label: meta.label,
          startISO: meta.startISO,
          endISO: meta.endISO,
          scoringPeriodIds: meta.scoringPeriodIds,
          calculatedDates: meta.startISO ? (() => {
            const dates = [];
            const start = new Date(meta.startISO);
            for (let i = 0; i < meta.scoringPeriodIds.length; i++) {
              const date = new Date(start);
              date.setUTCDate(start.getUTCDate() + i);
              dates.push(date.toISOString().slice(0, 10));
            }
            return dates;
          })() : null
        });
      }
    } catch (error) {
      console.error('📅 [debugWeekDates] Error:', error);
    }
  }

  toggleAPIMode(useRealAPI: boolean): void {
    // This method is deprecated - we always use real API
    console.warn('toggleAPIMode is deprecated - system always uses real API');
  }
}

export const dataService = new DataService();