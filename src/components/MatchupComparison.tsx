import React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, TrendingUp, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';

interface MatchupComparisonProps {
  selectedTeam?: number | null;
}

export const MatchupComparison = ({ selectedTeam: initialSelectedTeam }: MatchupComparisonProps) => {
  const [team1Id, setTeam1Id] = useState(initialSelectedTeam || 1);
  const [team2Id, setTeam2Id] = useState(2);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [teams, setTeams] = useState<any[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    initializeComponent();
  }, []);

  useEffect(() => {
    loadWeeklyData();
  }, [selectedWeek]);

  // Sync team1Id when selectedTeam prop changes
  useEffect(() => {
    if (initialSelectedTeam !== undefined && initialSelectedTeam !== null && initialSelectedTeam !== team1Id) {
      setTeam1Id(initialSelectedTeam);
    }
  }, [initialSelectedTeam]);

  const initializeComponent = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const standings = await dataService.getTeamStandings();
      setTeams(Array.isArray(standings) ? standings : []);
      
      // Set team2 to a different team than team1
      if (Array.isArray(standings) && standings.length > 1) {
        const availableTeams = standings.filter(team => team.id !== team1Id);
        if (availableTeams.length > 0) {
          setTeam2Id(availableTeams[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to initialize matchup comparison:', err);
      setError('Failed to load matchup data.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadWeeklyData = async () => {
    try {
      const stats = await dataService.getWeeklyStats(selectedWeek);
      setWeeklyStats(stats);
    } catch (err) {
      console.warn('Failed to load weekly data:', err);
      setWeeklyStats(null);
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
            <p>Loading matchup data...</p>
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

  // Get stats for both teams
  const team1Stats = weeklyStats?.teamStats?.[team1Id] || {};
  const team2Stats = weeklyStats?.teamStats?.[team2Id] || {};
  const team1Data = teams.find(team => team.id === team1Id);
  const team2Data = teams.find(team => team.id === team2Id);

  const StatComparison = ({ category, team1Value, team2Value }: { 
    category: any; 
    team1Value: number; 
    team2Value: number; 
  }) => {
    // Determine winner (ERA and WHIP are inverse - lower is better)
    const isInverse = category.key === 'era' || category.key === 'whip';
    let team1Wins = false;
    let team2Wins = false;
    
    if (team1Value !== team2Value) {
      if (isInverse) {
        team1Wins = team1Value < team2Value && team1Value > 0;
        team2Wins = team2Value < team1Value && team2Value > 0;
      } else {
        team1Wins = team1Value > team2Value;
        team2Wins = team2Value > team1Value;
      }
    }

    return (
      <div className="grid grid-cols-3 gap-4 items-center p-3 bg-gray-50 rounded-lg">
        <div className={`text-center p-2 rounded ${team1Wins ? 'bg-green-100 text-green-700' : 'bg-white'}`}>
          <span className="font-medium">
            {category.key === 'battingAverage' || category.key === 'era' || category.key === 'whip' 
              ? (team1Value || 0).toFixed(3) 
              : (team1Value || 0)}
          </span>
        </div>
        <div className="text-center">
          <span className="text-sm font-medium text-gray-600">{category.name}</span>
        </div>
        <div className={`text-center p-2 rounded ${team2Wins ? 'bg-green-100 text-green-700' : 'bg-white'}`}>
          <span className="font-medium">
            {category.key === 'battingAverage' || category.key === 'era' || category.key === 'whip' 
              ? (team2Value || 0).toFixed(3) 
              : (team2Value || 0)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Team Comparison</h1>
          <p className="text-gray-600">Compare team performances side by side</p>
        </div>

        {/* Team & Week Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Teams and Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Team 1</label>
                <Select value={team1Id.toString()} onValueChange={(value) => setTeam1Id(parseInt(value))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {teams.map(team => (
                      <SelectItem key={team.id || team.teamId} value={(team.id || team.teamId).toString()}>
                        {team.name || team.teamName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Team 2</label>
                <Select value={team2Id.toString()} onValueChange={(value) => setTeam2Id(parseInt(value))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {teams.map(team => (
                      <SelectItem key={team.id || team.teamId} value={(team.id || team.teamId).toString()}>
                        {team.name || team.teamName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Week</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWeekChange('prev')}
                    disabled={selectedWeek <= 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="flex-1 text-center font-medium">Week {selectedWeek}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWeekChange('next')}
                    disabled={selectedWeek >= 26}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comparison Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={20} />
              Week {selectedWeek} Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Team Headers */}
            <div className="grid grid-cols-3 gap-4 items-center mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="text-center">
                <h3 className="font-bold text-lg">{team1Data?.abbrev || team1Data?.name}</h3>
                <p className="text-sm text-gray-600">{team1Data?.owner}</p>
              </div>
              <div className="text-center">
                <span className="text-sm font-medium text-gray-600">VS</span>
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg">{team2Data?.abbrev || team2Data?.name}</h3>
                <p className="text-sm text-gray-600">{team2Data?.owner}</p>
              </div>
            </div>

            {/* Batting Comparison */}
            <div className="mb-6">
              <h4 className="font-medium mb-3 text-blue-600">Batting Stats</h4>
              <div className="space-y-2">
                {scoringCategories.filter(cat => cat.type === 'batting').map(category => (
                  <StatComparison
                    key={category.key}
                    category={category}
                    team1Value={team1Stats[category.key] || 0}
                    team2Value={team2Stats[category.key] || 0}
                  />
                ))}
              </div>
            </div>

            {/* Pitching Comparison */}
            <div>
              <h4 className="font-medium mb-3 text-green-600">Pitching Stats</h4>
              <div className="space-y-2">
                {scoringCategories.filter(cat => cat.type === 'pitching').map(category => (
                  <StatComparison
                    key={category.key}
                    category={category}
                    team1Value={team1Stats[category.key] || 0}
                    team2Value={team2Stats[category.key] || 0}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};