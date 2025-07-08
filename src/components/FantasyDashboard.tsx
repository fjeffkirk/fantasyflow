import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ChevronLeft, ChevronRight, TrendingUp, Trophy, Calendar, HelpCircle, ArrowLeft } from 'lucide-react';
import { dataService } from '../services/dataService';
import { WeekMeta } from '../utils/weekUtils';
import { DailyLineup } from './DailyLineup';
import { weeklyEstimateService, WeeklyEstimate } from '../services/weeklyEstimateService';
import { useDataContext } from '../context/DataContext';

type ApiStatus = 'unknown' | 'good' | 'bad';

const InitialSetup = ({ onSetupComplete }: { onSetupComplete: () => void }) => {
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [validity, setValidity] = useState({ s2: false, swid: false, leagueId: false });
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Dev mode: allow 'test' in all fields
    if (espnS2 === 'test' && swid === 'test' && leagueId === 'test') {
      setValidity({ s2: true, swid: true, leagueId: true });
    } else {
      setValidity({
        s2: espnS2.length >= 50,
        swid: swid.length >= 30,
        leagueId: /^\d+$/.test(leagueId),
      });
    }
  }, [espnS2, swid, leagueId]);

  const isFormValid = validity.s2 && validity.swid && validity.leagueId;

  const handleSave = () => {
    if (!isFormValid) return;

    // If dev mode ('test' credentials) toggle fake API and skip validation lengths
    if (espnS2 === 'test' && swid === 'test' && leagueId === 'test') {
      dataService.toggleAPIMode(false); // use mock/static data
      localStorage.setItem('dev_mode', 'true');
    } else {
      let finalSwid = swid;
      if (finalSwid.startsWith('{') && finalSwid.endsWith('}')) {
        finalSwid = finalSwid.slice(1, -1);
      }
      localStorage.setItem('espn_s2', espnS2);
      localStorage.setItem('swid', finalSwid);
      localStorage.setItem('leagueId', leagueId);
    }
    onSetupComplete();
  };

  const getBrowserInstructions = () => {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      return {
        name: 'Chrome',
        steps: [
          'Go to ESPN Fantasy Baseball and log in to your account',
          'Navigate to your specific league homepage (not just espn.com/fantasy)',
          'Make sure you\'re on the page that shows your league name and teams',
          'Right-click anywhere on the page and select "Inspect" or press F12',
          'Click on the "Application" tab at the top',
          'In the left sidebar, expand "Storage" → "Cookies"',
          'Click on "https://fantasy.espn.com"',
          'Find "ESPN_S2" in the list and copy its entire Value',
          'Find "SWID" in the list and copy its entire Value',
          'Your League ID is in your current URL: fantasy.espn.com/baseball/league?leagueId=XXXXXX'
        ]
      };
    } else if (userAgent.includes('Firefox')) {
      return {
        name: 'Firefox',
        steps: [
          'Go to ESPN Fantasy Baseball and log in to your account',
          'Navigate to your specific league homepage (not just espn.com/fantasy)',
          'Make sure you\'re on the page that shows your league name and teams',
          'Right-click anywhere on the page and select "Inspect Element" or press F12',
          'Click on the "Storage" tab at the top',
          'In the left sidebar, expand "Cookies"',
          'Click on "https://fantasy.espn.com"',
          'Find "ESPN_S2" in the list and copy its entire Value',
          'Find "SWID" in the list and copy its entire Value',
          'Your League ID is in your current URL: fantasy.espn.com/baseball/league?leagueId=XXXXXX'
        ]
      };
    } else if (userAgent.includes('Safari')) {
      return {
        name: 'Safari',
        steps: [
          'Go to ESPN Fantasy Baseball and log in to your account',
          'Navigate to your specific league homepage (not just espn.com/fantasy)',
          'Make sure you\'re on the page that shows your league name and teams',
          'Enable Developer Tools: Safari → Preferences → Advanced → Show Develop menu',
          'Right-click anywhere on the page and select "Inspect Element"',
          'Click on the "Storage" tab at the top',
          'In the left sidebar, click on "Cookies"',
          'Click on "https://fantasy.espn.com"',
          'Find "ESPN_S2" in the list and copy its entire Value',
          'Find "SWID" in the list and copy its entire Value',
          'Your League ID is in your current URL: fantasy.espn.com/baseball/league?leagueId=XXXXXX'
        ]
      };
    } else if (userAgent.includes('Edg')) {
      return {
        name: 'Edge',
        steps: [
          'Go to ESPN Fantasy Baseball and log in to your account',
          'Navigate to your specific league homepage (not just espn.com/fantasy)',
          'Make sure you\'re on the page that shows your league name and teams',
          'Right-click anywhere on the page and select "Inspect" or press F12',
          'Click on the "Application" tab at the top',
          'In the left sidebar, expand "Storage" → "Cookies"',
          'Click on "https://fantasy.espn.com"',
          'Find "ESPN_S2" in the list and copy its entire Value',
          'Find "SWID" in the list and copy its entire Value',
          'Your League ID is in your current URL: fantasy.espn.com/baseball/league?leagueId=XXXXXX'
        ]
      };
    } else {
      return {
        name: 'Your Browser',
        steps: [
          'Go to ESPN Fantasy Baseball and log in to your account',
          'Navigate to your specific league homepage (not just espn.com/fantasy)',
          'Make sure you\'re on the page that shows your league name and teams',
          'Open Developer Tools (usually F12 or right-click → Inspect)',
          'Look for an "Application", "Storage", or "Network" tab',
          'Find the Cookies section for "fantasy.espn.com"',
          'Locate "ESPN_S2" and copy its entire Value',
          'Locate "SWID" and copy its entire Value',
          'Your League ID is in your current URL: fantasy.espn.com/baseball/league?leagueId=XXXXXX'
        ]
      };
    }
  };

  const browserInstructions = getBrowserInstructions();

  if (showHelp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100 flex flex-col items-center justify-center p-4">
        <img src="/fantasy-flow-logo.png" alt="Fantasy Flow Logo" className="w-80 mb-8" />
        <Card className="w-full max-w-2xl bg-white shadow-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">How to Find Your ESPN Credentials</CardTitle>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowHelp(false)}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-gray-600">Follow these steps for {browserInstructions.name}:</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Step-by-Step Instructions:</h3>
                <ol className="space-y-2 text-sm text-blue-800">
                  {browserInstructions.steps.map((step, index) => (
                    <li key={index} className="flex items-start">
                      <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-900 mb-2">Important Notes:</h3>
                <ul className="space-y-1 text-sm text-yellow-800">
                  <li>• ESPN_S2 should be a long string (50+ characters)</li>
                  <li>• SWID should be in format: {`{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`}</li>
                  <li>• League ID is just numbers (usually 6-8 digits)</li>
                  <li>• These values are unique to your ESPN account</li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => setShowHelp(false)}
              className="w-full bg-[#576AA7] text-white hover:bg-[#4f5d9a]"
            >
              Got it!
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100 flex flex-col items-center justify-center p-4">
      <img src="/fantasy-flow-logo.png" alt="Fantasy Flow Logo" className="w-80 mb-8" />
      <Card className="w-full max-w-lg bg-white shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to Fantasy Flow</CardTitle>
          <p className="text-gray-600">Please enter your ESPN credentials and League ID to get started.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="espn_s2_setup" className="font-medium">ESPN_S2</Label>
                <Button 
                  variant="link" 
                  onClick={() => setShowHelp(true)}
                  className="text-blue-600 hover:text-blue-800 p-0 h-auto font-medium"
                >
                  Help!
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="espn_s2_setup"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  className="bg-gray-50 placeholder:text-gray-400/50 flex-1"
                  placeholder="AEBfg... (example)"
                />
                {espnS2.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.s2 ? 'bg-green-500' : 'bg-red-500'}`} />}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="swid_setup" className="font-medium">SWID</Label>
                {swid.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.swid ? 'bg-green-500' : 'bg-red-500'}`} />}
              </div>
              <Input
                id="swid_setup"
                value={swid}
                onChange={(e) => setSwid(e.target.value)}
                className="bg-gray-50 placeholder:text-gray-400/50"
                placeholder="{1234ABCD-5678-...} (example)"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="leagueId_setup" className="font-medium">League ID</Label>
                {leagueId.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.leagueId ? 'bg-green-500' : 'bg-red-500'}`} />}
              </div>
              <Input
                id="leagueId_setup"
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
                className="bg-gray-50 placeholder:text-gray-400/50"
                placeholder="123456 (example)"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleSave} 
            disabled={!isFormValid}
            className="w-full bg-[#576AA7] text-white hover:bg-[#4f5d9a] disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-200"
          >
            Save and Continue
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export const FantasyDashboard = () => {
  const {
    leagueInfo,
    standings,
    currentWeek,
    weekMetaMap,
    weeklyStats,
    weeklyEstimate,
    isLoading,
    isWeekLoading,
    error,
    loadWeek,
  } = useDataContext();

  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [lastStandingsUpdate, setLastStandingsUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'lineup' | 'ai-daddy' | 'matchup'>('stats');
  // State for team-specific weekly estimate
  const [teamEstimate, setTeamEstimate] = useState<WeeklyEstimate | null>(null);
  const [isEstimateLoading, setIsEstimateLoading] = useState<boolean>(false);

  // Matchup state
  const [opponentTeamId, setOpponentTeamId] = useState<number | null>(null);
  const [opponentStats, setOpponentStats] = useState<any | null>(null);
  const [opponentEstimate, setOpponentEstimate] = useState<any | null>(null);
  const [isMatchupLoading, setIsMatchupLoading] = useState<boolean>(false);

  useEffect(() => {
    const loadMatchup = async () => {
      setIsMatchupLoading(true);
      if (!selectedTeam) return;
      try {
        const matchups = await dataService.getMatchups(currentWeek);
        const matchup = matchups.find((m:any) => m.homeTeamId === selectedTeam || m.awayTeamId === selectedTeam);
        if (!matchup) return;
        const oppId = matchup.homeTeamId === selectedTeam ? matchup.awayTeamId : matchup.homeTeamId;
        setOpponentTeamId(oppId);

        if (weeklyStats?.teamStats?.[oppId]) {
          setOpponentStats(weeklyStats.teamStats[oppId]);
        }

        const weeksHistory = Array.from({length:4},(_,i)=>currentWeek-(i+1)).filter(w=>w>0);
        const est = await dataService.getExpectedStats(oppId, weeksHistory);
        setOpponentEstimate(est);
      } catch(err){
        console.error('Failed to load matchup info', err);
      } finally {
        setIsMatchupLoading(false);
      }
    };
    loadMatchup();
  }, [selectedTeam, currentWeek, weeklyStats]);

  // Define scoring categories
  const scoringCategories = [
    { key: 'runs', name: 'R', type: 'batting' },
    { key: 'homeRuns', name: 'HR', type: 'batting' },
    { key: 'rbis', name: 'RBI', type: 'batting' },
    { key: 'stolenBases', name: 'SB', type: 'batting' },
    { key: 'battingAverage', name: 'AVG', type: 'batting' },
    { key: 'strikeouts', name: 'K', type: 'pitching' },
    { key: 'wins', name: 'W', type: 'pitching' },
    { key: 'saves', name: 'SV', type: 'pitching' },
    { key: 'era', name: 'ERA', type: 'pitching' },
    { key: 'whip', name: 'WHIP', type: 'pitching' }
  ];

  useEffect(() => {
    // console.log('LEAGUE INFO FROM CONTEXT:', leagueInfo);
  }, [leagueInfo]);

  // Load data for the first detected week only once
  const initialWeekLoaded = React.useRef(false);
  useEffect(() => {
    if (!initialWeekLoaded.current && currentWeek > 0) {
      initialWeekLoaded.current = true;
      loadWeek(currentWeek, true);
    }
  }, [currentWeek]);

  // Fetch team-specific weekly estimate whenever team or week changes
  useEffect(() => {
    const fetchEstimate = async () => {
      if (!selectedTeam) {
        setTeamEstimate(null);
        return;
      }
      setIsEstimateLoading(true);
      try {
        const weeksHistory = Array.from({length:4}, (_,i)=>currentWeek-(i+1)).filter(w=>w>0);
        const est = await dataService.getExpectedStats(selectedTeam, weeksHistory);
        setTeamEstimate(est);
      } catch (err) {
        console.error('Failed to fetch weekly estimate:', err);
        setTeamEstimate(null);
      } finally {
        setIsEstimateLoading(false);
      }
    };
    fetchEstimate();
  }, [selectedTeam, currentWeek]);

  // Auto-select first team when standings are loaded
  useEffect(() => {
    if (standings.length > 0 && !selectedTeam) {
      const firstTeam = standings[0];
      setSelectedTeam(firstTeam.id || firstTeam.teamId);
    }
  }, [standings, selectedTeam]);

  // Helper function to check if standings need automatic refresh
  const shouldAutoRefreshStandingsWithDate = (lastUpdate: Date | null): boolean => {
    if (!lastUpdate) {
      return true; // First time or corrupted data
    }

    // Get current time in ET
    const now = new Date();
    const etNow = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    // Find the most recent Monday 4 AM ET
    const mostRecentMondayAt4AM = new Date(etNow);
    const daysSinceMonday = (etNow.getDay() + 6) % 7; // 0 = Monday, 1 = Tuesday, etc.
    mostRecentMondayAt4AM.setDate(etNow.getDate() - daysSinceMonday);
    mostRecentMondayAt4AM.setHours(4, 0, 0, 0);
    
    // If today is Monday and it's before 4 AM, use last Monday
    if (etNow.getDay() === 1 && etNow.getHours() < 4) {
      mostRecentMondayAt4AM.setDate(mostRecentMondayAt4AM.getDate() - 7);
    }
    
    // Convert last update to ET for comparison
    const lastUpdateET = new Date(lastUpdate.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const shouldRefresh = lastUpdateET < mostRecentMondayAt4AM;
    
    return shouldRefresh;
  };

  // Wrapper function for state-based calls
  const shouldAutoRefreshStandings = (): boolean => {
    return shouldAutoRefreshStandingsWithDate(lastStandingsUpdate);
  };

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const availableWeeks = Object.keys(weekMetaMap).map(Number).sort((a, b) => a - b);
    if (availableWeeks.length === 0) return;
    const idx = availableWeeks.indexOf(currentWeek);
    if (direction === 'prev' && idx > 0) {
      loadWeek(availableWeeks[idx - 1]);
    } else if (direction === 'next' && idx < availableWeeks.length - 1) {
      loadWeek(availableWeeks[idx + 1]);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100 flex items-center justify-center">
        <Card className="w-96 bg-white">
          <CardContent className="p-6 text-center">
            <img src="/loading-ball.gif" alt="loading" className="h-24 w-24 mx-auto mb-4" />
            <p>Loading dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const needsSetup = !leagueInfo; // A simple check; can be made more robust
  if (needsSetup) {
    return <InitialSetup onSetupComplete={() => window.location.reload()} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100 p-6 flex items-center justify-center">
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
  const selectedTeamData = standings.find(team => (team.id || team.teamId) === selectedTeam);
  // Choose which estimate data to display (team specific first, fallback to context)
  const displayEstimate = teamEstimate || weeklyEstimate;
  const availableWeeks = Object.keys(weekMetaMap).map(Number).sort((a, b) => a - b);

  const computeRecord = (teamVals:any, oppVals:any) => {
    let wins=0, losses=0, ties=0;
    scoringCategories.forEach(cat=>{
      const t = teamVals?.[cat.key] ?? 0;
      const o = oppVals?.[cat.key] ?? 0;
      if(t===o){ties++;return;}
      const teamBetter = (['era','whip'].includes(cat.key)) ? (t < o) : (t > o);
      if(teamBetter) wins++; else losses++;
    });
    return `${wins}-${losses}-${ties}`;
  };

  const currentRecord = opponentStats && currentWeekStats ? computeRecord(currentWeekStats, opponentStats) : null;
  const expectedRecord = opponentEstimate && displayEstimate ? computeRecord(displayEstimate, opponentEstimate) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Week Navigation */}
      <Card className="mb-6 bg-white border border-[#8c8c8c] shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => handleWeekChange('prev')}
              disabled={currentWeek <= 1}
              className="flex items-center gap-2"
            >
              <ChevronLeft size={16} />
              Previous
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-gray-600 font-medium mb-0.5">
                {leagueInfo?.name || leagueInfo?.settings?.name || 'League Name Here'}
              </p>
              <h2 className="text-xl font-bold">
                {weekMetaMap[currentWeek]?.label || `Week ${currentWeek}`}
              </h2>
            </div>
            
            <Button
              variant="outline"
              onClick={() => handleWeekChange('next')}
              disabled={availableWeeks.indexOf(currentWeek) === availableWeeks.length - 1}
              className="flex items-center gap-2"
            >
              Next
              <ChevronRight size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Standings - Always visible above tabs */}
      <Card className="bg-white border border-[#8c8c8c] shadow-sm">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy size={20} />
              Team Standings
            </CardTitle>
            {leagueInfo?.settings?.name && (
              <p className="text-sm text-gray-500 mt-1">{leagueInfo.settings.name}</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* East Division */}
            <div>
              <h3 className="text-xs font-semibold text-blue-600 mb-2 px-1">East Division</h3>
              <div className="space-y-1">
                {standings
                  .filter(team => team.divisionId === 0 || team.divisionId === undefined) // Include undefined for fallback
                  .sort((a, b) => (b.winPercentage || 0) - (a.winPercentage || 0))
                  .map((team, index) => {
                    const teamId = team.id || team.teamId;
                    const teamName = team.name || team.teamName || `Team ${teamId}`;
                    const teamOwner = team.owner || 'Unknown Owner';
                    
                    return (
                      <div 
                        key={teamId} 
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedTeam === teamId ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => setSelectedTeam(teamId)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm w-4">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{teamName}</p>
                            <p className="text-xs text-gray-600 truncate">{teamOwner}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm">{team.wins || 0}-{team.losses || 0}{team.ties ? `-${team.ties}` : ''}</p>
                          <p className="text-xs text-gray-600">{(team.winPercentage || 0).toFixed(3)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* West Division */}
            <div>
              <h3 className="text-xs font-semibold text-green-600 mb-2 px-1">West Division</h3>
              <div className="space-y-1">
                {standings
                  .filter(team => team.divisionId === 1)
                  .sort((a, b) => (b.winPercentage || 0) - (a.winPercentage || 0))
                  .map((team, index) => {
                    const teamId = team.id || team.teamId;
                    const teamName = team.name || team.teamName || `Team ${teamId}`;
                    const teamOwner = team.owner || 'Unknown Owner';
                    
                    return (
                      <div 
                        key={teamId} 
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedTeam === teamId ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => setSelectedTeam(teamId)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm w-4">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{teamName}</p>
                            <p className="text-xs text-gray-600 truncate">{teamOwner}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm">{team.wins || 0}-{team.losses || 0}{team.ties ? `-${team.ties}` : ''}</p>
                          <p className="text-xs text-gray-600">{(team.winPercentage || 0).toFixed(3)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          {lastStandingsUpdate && (
            <div className="text-xs text-gray-400 mt-4 text-right">Last updated: {lastStandingsUpdate.toLocaleString()}</div>
          )}
        </CardContent>
      </Card>

              {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-8">
          <Button
            variant="ghost"
            onClick={() => setActiveTab('stats')}
            className={`flex-1 rounded-none text-lg hover:text-blue-600 ${activeTab === 'stats' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : ''}`}
          >
            Stats
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('matchup')}
            className={`flex-1 rounded-none text-lg hover:text-blue-600 ${activeTab === 'matchup' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : ''}`}
          >
            Matchup
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('lineup')}
            className={`flex-1 rounded-none text-lg hover:text-blue-600 ${activeTab === 'lineup' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : ''}`}
          >
            Lineup
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('ai-daddy')}
            className={`flex-1 rounded-none text-lg hover:text-blue-600 ${activeTab === 'ai-daddy' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : ''}`}
          >
            AI Daddy
          </Button>
        </div>

        <div>
        {activeTab === 'stats' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Current Weekly Stats Card */}
              <Card className="bg-white border border-[#8c8c8c] shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar size={20} />
                    Weekly Stats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isWeekLoading || isEstimateLoading ? (
                    <div className="text-center py-12">
                      <img src="/loading-ball.gif" alt="loading" className="h-16 w-16 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Loading weekly stats...</p>
                    </div>
                  ) : selectedTeam && selectedTeamData ? (
                    <div className="space-y-4">
                      {/* Performance Stats */}
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <h4 className="font-medium mb-3 text-blue-600">Batting</h4>
                          <div className="space-y-2">
                            {scoringCategories.filter(cat => cat.type === 'batting').map(category => (
                              <div key={category.key} className="flex justify-between items-center p-2 bg-gray-50 rounded">
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
                              <div key={category.key} className="flex justify-between items-center p-2 bg-gray-50 rounded">
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
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>Select a team to view weekly stats</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* End of Week Estimates Card */}
              <Card className="bg-white border border-[#8c8c8c] shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp size={20} />
                    End of Week Estimate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isWeekLoading || isEstimateLoading ? (
                    <div className="text-center py-12">
                      <img src="/loading-ball.gif" alt="loading" className="h-16 w-16 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Loading estimates...</p>
                    </div>
                  ) : selectedTeam && selectedTeamData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <h4 className="font-medium mb-3 text-blue-600">Batting Projections</h4>
                          <div className="space-y-2">
                            {scoringCategories.filter(cat => cat.type === 'batting').map(category => (
                              <div key={category.key} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                                <span className="text-sm">{category.name}</span>
                                <span className="font-medium">
                                  {displayEstimate ? (
                                    category.key === 'battingAverage' ? 
                                      Number(displayEstimate[category.key as keyof WeeklyEstimate] ?? 0).toFixed(3) : 
                                      displayEstimate[category.key as keyof WeeklyEstimate] || 0
                                  ) : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-3 text-green-600">Pitching Projections</h4>
                          <div className="space-y-2">
                            {scoringCategories.filter(cat => cat.type === 'pitching').map(category => (
                              <div key={category.key} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                                <span className="text-sm">{category.name}</span>
                                <span className="font-medium">
                                  {displayEstimate ? (
                                    category.key === 'era' || category.key === 'whip' ? 
                                      Number(displayEstimate[category.key as keyof WeeklyEstimate] ?? 0).toFixed(2) : 
                                      displayEstimate[category.key as keyof WeeklyEstimate] || 0
                                  ) : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-500">
                        <p>* Based on last 4 weeks of MLB data for projected starters</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>Select a team to view estimates</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {activeTab === 'lineup' && (
          <>
            {/* Daily Lineup - Full width */}
            {selectedTeam && selectedTeamData ? (
              <DailyLineup 
                teamId={selectedTeam} 
                week={currentWeek}
              />
            ) : (
              <Card className="bg-white border border-[#8c8c8c] shadow-sm mt-6">
                <CardContent>
                  <div className="text-center py-12 text-gray-500">
                    <p>Select a team to view daily lineup</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {activeTab === 'ai-daddy' && (
          <>
            {/* AI Daddy - Placeholder */}
            <Card className="bg-white border border-[#8c8c8c] shadow-sm mt-6">
              <CardHeader>
                <CardTitle>AI Daddy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <p>AI Daddy features coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'matchup' && (
          <>
            <div className="space-y-6 mt-6">
              {/* Current Matchup Results */}
              <Card className="bg-white border border-[#8c8c8c] shadow-sm">
                <CardHeader>
                  <CardTitle>Current Matchup {currentRecord && (<span className="text-sm text-gray-600 ml-2">({currentRecord})</span>)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {isWeekLoading || isEstimateLoading || isMatchupLoading ? (
                    <div className="text-center py-12">
                      <img src="/loading-ball.gif" alt="loading" className="h-16 w-16 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Loading matchup data...</p>
                    </div>
                  ) : opponentStats && currentWeekStats ? (
                    <div className={`grid text-sm`} style={{gridTemplateColumns:`120px repeat(${scoringCategories.length},minmax(0,1fr))`}}>
                      {/* header row */}
                      <span></span>
                      {scoringCategories.map(cat=>(<span key={cat.key} className="font-semibold text-center">{cat.name}</span>))}
                      {/* your team row */}
                      <span className="font-bold">{selectedTeamData?.abbrev || selectedTeamData?.name || 'Your Team'}</span>
                      {scoringCategories.map(cat=>{
                        const valTeam=currentWeekStats[cat.key]??0;
                        const valOpp=opponentStats[cat.key]??0;
                        const better=(['era','whip'].includes(cat.key))? (valTeam<valOpp):(valTeam>valOpp);
                        return <span key={cat.key} className={`text-center ${better?'font-bold text-green-600':''}`}>{typeof valTeam==='number'?valTeam.toFixed(cat.key==='battingAverage'?3:2):valTeam}</span>
                      })}
                      {/* opponent row */}
                      <span className="font-bold">{standings.find(t=>(t.id||t.teamId)===opponentTeamId)?.abbrev || standings.find(t=>(t.id||t.teamId)===opponentTeamId)?.name || 'Opponent'}</span>
                      {scoringCategories.map(cat=>{
                        const valTeam=currentWeekStats[cat.key]??0;
                        const valOpp=opponentStats[cat.key]??0;
                        const betterOpp=(['era','whip'].includes(cat.key))? (valOpp<valTeam):(valOpp>valTeam);
                        return <span key={cat.key} className={`text-center ${betterOpp?'font-bold text-green-600':''}`}>{typeof valOpp==='number'?valOpp.toFixed(cat.key==='battingAverage'?3:2):valOpp}</span>
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500">Matchup data unavailable.</p>
                  )}
                </CardContent>
              </Card>

              {/* Expected Outcome */}
              <Card className="bg-white border border-[#8c8c8c] shadow-sm">
                <CardHeader>
                  <CardTitle>Expected Outcome {expectedRecord && (<span className="text-sm text-gray-600 ml-2">({expectedRecord})</span>)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {isWeekLoading || isEstimateLoading || isMatchupLoading ? (
                    <div className="text-center py-12">
                      <img src="/loading-ball.gif" alt="loading" className="h-16 w-16 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Loading outcome...</p>
                    </div>
                  ) : opponentEstimate && displayEstimate ? (
                    <div className={`grid text-sm`} style={{gridTemplateColumns:`120px repeat(${scoringCategories.length},minmax(0,1fr))`}}>
                      <span></span>
                      {scoringCategories.map(cat=>(<span key={cat.key} className="font-semibold text-center">{cat.name}</span>))}
                      <span className="font-bold">{selectedTeamData?.abbrev || selectedTeamData?.name || 'Your Team'}</span>
                      {scoringCategories.map(cat=>{
                        const valTeam=displayEstimate[cat.key as keyof typeof displayEstimate]??0;
                        const valOpp=opponentEstimate[cat.key]??0;
                        const better=(['era','whip'].includes(cat.key))? (valTeam<valOpp):(valTeam>valOpp);
                        return <span key={cat.key} className={`text-center ${better?'font-bold text-green-600':''}`}>{typeof valTeam==='number'?valTeam.toFixed(cat.key==='battingAverage'?3:2):valTeam}</span>
                      })}
                      <span className="font-bold">{standings.find(t=>(t.id||t.teamId)===opponentTeamId)?.abbrev || standings.find(t=>(t.id||t.teamId)===opponentTeamId)?.name || 'Opponent'}</span>
                      {scoringCategories.map(cat=>{
                        const valTeam=displayEstimate[cat.key as keyof typeof displayEstimate]??0;
                        const valOpp=opponentEstimate[cat.key]??0;
                        const betterOpp=(['era','whip'].includes(cat.key))? (valOpp<valTeam):(valOpp>valTeam);
                        return <span key={cat.key} className={`text-center ${betterOpp?'font-bold text-green-600':''}`}>{typeof valOpp==='number'?valOpp.toFixed(cat.key==='battingAverage'?3:2):valOpp}</span>
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500">Outcome data unavailable.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};