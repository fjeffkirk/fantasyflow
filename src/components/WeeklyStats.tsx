import React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronLeft, ChevronRight, TrendingUp, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { mlbStatService } from '../services/mlbStatService';
import { PlayerMatcher, ESPNPlayer, MLBPlayer } from '../services/playerMatcher';
import { getCurrentMatchupPeriod, WeekMeta } from '../utils/weekUtils';

interface WeeklyStatsProps {
  selectedTeam?: number | null;
}

export const WeeklyStats = ({ selectedTeam: initialSelectedTeam }: WeeklyStatsProps) => {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(initialSelectedTeam || null);
  const [teams, setTeams] = useState<any[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper: Get 7 scoringPeriodIds for a week
  const getScoringPeriodIdsForWeek = (weekNumber: number) => {
    const firstDayId = (weekNumber - 1) * 7 + 1;
    return Array.from({ length: 7 }, (_, i) => firstDayId + i);
  };

  const getDatesForWeek = (weekNumber: number): Date[] => {
    const dates: Date[] = [];
    // This is an approximation. A more robust solution would use a proper calendar library
    // or rely on a week metadata service. For now, assume week 1 starts on a known date.
    const week1StartDate = new Date('2024-03-28'); // MLB Opening Day 2024, adjust if needed
    const startOfWeek = new Date(week1StartDate);
    startOfWeek.setDate(startOfWeek.getDate() + (weekNumber - 1) * 7);

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        dates.push(date);
    }
    return dates;
  };

  // Define scoring categories
  const scoringCategories = [
    { key: 'runs', name: 'Runs', type: 'batting' },
    { key: 'homeRuns', name: 'Home Runs', type: 'batting' },
    { key: 'rbis', name: 'RBIs', type: 'batting' },
    { key: 'stolenBases', name: 'Stolen Bases', type: 'batting' },
    { key: 'battingAverage', name: 'Batting Average', type: 'batting' },
    { key: 'hits', name: 'Hits', type: 'batting' },
    { key: 'strikeouts', name: 'Strikeouts', type: 'pitching' },
    { key: 'wins', name: 'Wins', type: 'pitching' },
    { key: 'saves', name: 'Saves', type: 'pitching' },
    { key: 'era', name: 'ERA', type: 'pitching' },
    { key: 'whip', name: 'WHIP', type: 'pitching' },
    { key: 'qualityStarts', name: 'Quality Starts', type: 'pitching' }
  ];

  useEffect(() => {
    initializeWeeklyStats();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      loadWeeklyStats();
    }
  }, [selectedWeek, selectedTeam]);

  // Sync selectedTeam when prop changes
  useEffect(() => {
    if (initialSelectedTeam !== undefined && initialSelectedTeam !== null && initialSelectedTeam !== selectedTeam) {
      setSelectedTeam(initialSelectedTeam);
    }
  }, [initialSelectedTeam]);

  const initializeWeeklyStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const standings = await dataService.getTeamStandings();
      setTeams(Array.isArray(standings) ? standings : []);
      if (Array.isArray(standings) && standings.length > 0 && !selectedTeam) {
        const firstTeam = standings[0];
        const teamId = firstTeam.id || firstTeam.teamId;
        if (teamId) {
          setSelectedTeam(teamId);
        }
      }
    } catch (err) {
      console.error('Failed to initialize weekly stats:', err);
      setError('Failed to load weekly statistics data.');
    } finally {
      setIsLoading(false);
    }
  };

  // MLB aggregation using direct scoringPeriodId calculation
  const loadWeeklyStats = async () => {
    if (!selectedTeam) return;
    setIsLoading(true);
    setError(null);
    setWeeklyStats(null); // Reset stats on new load

    try {
      const playerMatcher = new PlayerMatcher();
      const datesForWeek = getDatesForWeek(selectedWeek);
      const allMatchedPerformances: any[] = [];

      // Parallelize ESPN and MLB fetches for all days
      const espnRosterPromises = datesForWeek.map((date, idx) => {
        const scoringPeriodId = (selectedWeek - 1) * 7 + idx + 1;
        return dataService.getTeamRosterForDay(selectedTeam, scoringPeriodId);
      });
      const mlbPlayersPromises = datesForWeek.map(date => mlbStatService.getMLBPlayersForDate(date.toISOString().slice(0, 10)));
      const mlbStatsPromises = datesForWeek.map(date => mlbStatService.getDailyStatsMap(date.toISOString().slice(0, 10)));

      const [espnRosters, mlbPlayersList, mlbStatsMaps] = await Promise.all([
        Promise.all(espnRosterPromises),
        Promise.all(mlbPlayersPromises),
        Promise.all(mlbStatsPromises)
      ]);

      for (let i = 0; i < datesForWeek.length; i++) {
        const dateStr = datesForWeek[i].toISOString().slice(0, 10);
        const espnStarters = espnRosters[i].filter((p: any) => p.lineupSlotId <= 21 && p.status === 'ACTIVE');
        if (espnStarters.length === 0) continue;
        const mlbPlayers = mlbPlayersList[i];
        const dailyStatsMap = mlbStatsMaps[i];
        const matches = await playerMatcher.matchPlayers(espnStarters, mlbPlayers);
        for (const match of matches) {
          if (match.mlbPlayer && match.confidence > 0.7 && match.mlbPlayer.id != null) {
            const stat = (dailyStatsMap as Record<string, any>)[String(match.mlbPlayer.id)];
            if (!stat) continue;
            allMatchedPerformances.push({
              espnPlayer: match.espnPlayer,
              mlbStats: { batting: stat.hitting, pitching: stat.pitching },
            });
          }
        }
      }

      // Aggregate stats for the week
      const agg = {
        runs: 0, homeRuns: 0, rbis: 0, stolenBases: 0, battingAverage: 0, hits: 0, atBats: 0,
        strikeouts: 0, wins: 0, saves: 0, era: 0, whip: 0, qualityStarts: 0, inningsPitched: 0, earnedRuns: 0, walks: 0, hitsAllowed: 0
      };
      
      const pitcherPositions = ['P', 'SP', 'RP'];

      for (const performance of allMatchedPerformances) {
        const battingStats = performance.mlbStats?.batting;
        const pitchingStats = performance.mlbStats?.pitching;

        if (battingStats && Object.keys(battingStats).length > 0) {
          agg.runs += Number(battingStats.R || 0);
          agg.homeRuns += Number(battingStats.HR || 0);
          agg.rbis += Number(battingStats.RBI || 0);
          agg.stolenBases += Number(battingStats.SB || 0);
          agg.hits += Number(battingStats.H || 0);
          agg.atBats += Number(battingStats.AB || 0);
        }

        if (pitchingStats && Object.keys(pitchingStats).length > 0) {
          agg.strikeouts += Number(pitchingStats.K || 0);
          agg.wins += Number(pitchingStats.W || 0);
          agg.saves += Number(pitchingStats.SV || 0);

          const ip = parseFloat(pitchingStats.IP || 0);
          if (ip > 0) {
              agg.inningsPitched += ip;
              const er = Number(pitchingStats.ERA * ip / 9 || 0); // ERA is rate, convert to ER
              agg.earnedRuns += er;
              agg.walks += Number(pitchingStats.WHIP * ip - pitchingStats.H || 0); // WHIP = (BB+H)/IP, so BB = WHIP*IP - H
              agg.hitsAllowed += Number(pitchingStats.H || 0);
              if (ip >= 6.0 && er <= 3) {
                agg.qualityStarts += 1;
              }
          }
        }
      }

      agg.battingAverage = agg.atBats ? agg.hits / agg.atBats : 0;
      agg.era = agg.inningsPitched ? (agg.earnedRuns * 9) / agg.inningsPitched : 0;
      agg.whip = agg.inningsPitched ? (agg.walks + agg.hitsAllowed) / agg.inningsPitched : 0;

      console.log('[WeeklyStats] Aggregated stats:', agg);
      setWeeklyStats({ teamStats: { [selectedTeam]: agg } });
    } catch (err) {
      setWeeklyStats(null);
      setError('Failed to load MLB weekly stats.');
      console.error('Failed to load MLB weekly stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWeekChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && selectedWeek > 1) {
      setSelectedWeek(selectedWeek - 1);
    } else if (direction === 'next' && selectedWeek < 26) {
      setSelectedWeek(selectedWeek + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <Loader2 className="animate-spin h-8 w-8 mx-auto mb-4" />
            <p>Loading weekly stats...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto bg-red-50 border-red-200">
          <CardContent className="p-6 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get current week stats for the selected team
  const currentWeekStats = selectedTeam && weeklyStats?.teamStats ? 
    weeklyStats.teamStats[selectedTeam] : 
    null;
  const selectedTeamData = teams.find(team => team.id === selectedTeam);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Weekly Statistics</h1>
              <p className="text-gray-600">Analyze team performance across different weeks</p>
            </div>
            
            {/* Team Selection */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Team:</span>
                <Select
                  value={selectedTeam?.toString() || ""}
                  onValueChange={(value) => setSelectedTeam(parseInt(value))}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-48 bg-white">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Week Navigation */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => handleWeekChange('prev')}
                disabled={selectedWeek <= 1}
                className="flex items-center gap-2"
              >
                <ChevronLeft size={16} />
                Previous
              </Button>
              
              <div className="text-center">
                <h2 className="text-xl font-bold">Week {selectedWeek}</h2>
                <p className="text-sm text-gray-600">Fantasy Baseball Week</p>
              </div>
              
              <Button
                variant="outline"
                onClick={() => handleWeekChange('next')}
                disabled={selectedWeek >= 26}
                className="flex items-center gap-2"
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Stats Display */}
        {selectedTeam && weeklyStats ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Week {selectedWeek} Statistics - {selectedTeamData?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3 text-blue-600">Batting</h4>
                  <div className="space-y-2">
                    {scoringCategories.filter(cat => cat.type === 'batting').map(category => (
                      <div key={category.key} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                        <span className="text-sm">{category.name}</span>
                        <span className="font-medium">
                          {currentWeekStats ? 
                            (category.key === 'battingAverage' ? 
                              currentWeekStats[category.key]?.toFixed(3) || '0.000' : 
                              currentWeekStats[category.key] || 0
                            ) : '-'
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-3 text-green-600">Pitching</h4>
                  <div className="space-y-2">
                    {scoringCategories.filter(cat => cat.type === 'pitching').map(category => (
                      <div key={category.key} className="flex justify-between items-center p-2 bg-green-50 rounded">
                        <span className="text-sm">{category.name}</span>
                        <span className="font-medium">
                          {currentWeekStats ? 
                            (category.key === 'era' || category.key === 'whip' ? 
                              currentWeekStats[category.key]?.toFixed(2) || '0.00' : 
                              currentWeekStats[category.key] || 0
                            ) : '-'
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 text-lg">Select a team to view weekly statistics</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};