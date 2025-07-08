import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { dataService } from '../services/dataService';

// Interfaces for our context, matching the data structures from dataService
interface DataContextType {
  leagueInfo: any;
  teams: any[];
  standings: any[];
  currentWeek: number;
  weekMetaMap: Record<number, any>;
  weeklyStats: any;
  weeklyEstimate: any;
  
  isLoading: boolean;
  isWeekLoading: boolean;
  error: string | null;

  useRealAPI: boolean;
  
  // Functions to interact with the data
  loadWeek: (week: number, isInitialLoad?: boolean) => Promise<void>;
  refreshStandings: () => Promise<void>;
  toggleApiMode: () => void;
  getRoster: (teamId: number, week?: number) => Promise<any[]>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [leagueInfo, setLeagueInfo] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(0);
  const [weekMetaMap, setWeekMetaMap] = useState<Record<number, any>>({});
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [weeklyEstimate, setWeeklyEstimate] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWeekLoading, setIsWeekLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [useRealAPI, setUseRealApi] = useState<boolean>(true);

  const initializeData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [info, teamsData, standingsData, week] = await Promise.all([
        dataService.getLeagueInfo(),
        dataService.getTeams(),
        dataService.getTeamStandings(),
        dataService.getCurrentWeek(),
      ]);
      
      const metaMap = await dataService.getWeekMetaMap();

      setLeagueInfo(info);
      setTeams(teamsData);
      setStandings(standingsData);
      setCurrentWeek(week);
      setWeekMetaMap(metaMap);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during initialization.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Dev mode stub: bypass API calls
    const devMode = localStorage.getItem('dev_mode') === 'true';
    if (devMode) {
      setLeagueInfo({ name: 'Fantasy Flow Demo', settings: { name: 'Demo League' }});
      setTeams([]);
      setStandings([]);
      setCurrentWeek(1);
      setWeekMetaMap({});
      setWeeklyStats(null);
      setWeeklyEstimate(null);
      setIsLoading(false);
      return;
    }
    initializeData();
  }, [initializeData]);

  const loadWeek = useCallback(async (week: number, isInitialLoad = false) => {
    // Show the newly-selected week in the UI immediately
    setCurrentWeek(week);

    // Clear any previous week data so UI can display loading states
    if (!isInitialLoad) setIsWeekLoading(true);
    setWeeklyStats(null);
    setWeeklyEstimate(null);
    setError(null);

    try {
      const [stats, estimate] = await Promise.all([
        dataService.getWeeklyStats(week),
        dataService.getExpectedStats(0, [week]) // teamId 0 for league-wide projections
      ]);

      // Only commit the results if they correspond to the currently-selected week
      setWeeklyStats(stats);
      setWeeklyEstimate(estimate);
    } catch (err) {
      setError(err instanceof Error ? `Failed to load data for week ${week}.` : 'An unknown error occurred.');
    } finally {
      if (!isInitialLoad) setIsWeekLoading(false);
    }
  }, []);

  const refreshStandings = useCallback(async () => {
    try {
      dataService.clearCache(); // Specifically clear cache for refresh
      const standingsData = await dataService.getTeamStandings();
      setStandings(standingsData);
    } catch (err) {
       setError(err instanceof Error ? 'Failed to refresh standings.' : 'An unknown error occurred.');
    }
  }, []);

  const getRoster = useCallback(async (teamId: number, week?: number) => {
    return dataService.getTeamRoster(teamId, week);
  }, []);

  const toggleApiMode = useCallback(() => {
    const newMode = !useRealAPI;
    dataService.toggleAPIMode(newMode);
    setUseRealApi(newMode);
    initializeData(); // Re-initialize all data with the new API mode
  }, [useRealAPI, initializeData]);

  const value: DataContextType = {
    leagueInfo,
    teams,
    standings,
    currentWeek,
    weekMetaMap,
    weeklyStats,
    weeklyEstimate,
    isLoading,
    isWeekLoading,
    error,
    useRealAPI,
    loadWeek,
    refreshStandings,
    toggleApiMode,
    getRoster,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}; 