import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { dataService } from '../services/dataService';
import { Skeleton } from './ui/skeleton';
import { Users, ShieldCheck } from 'lucide-react';
import { RosterEntry } from "@/types/fantasy";
import { getCurrentMatchupPeriod, WeekMeta } from '../utils/weekUtils';
import { mlbStatService } from '../services/mlbStatService';
import { playerMatcher, ESPNPlayer, MLBPlayer } from '../services/playerMatcher';

const BENCH_SLOT_ID = 16;
const IL_SLOT_ID = 17;
const PITCHER_ELIGIBILITY_SLOTS = [13, 14, 15];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const isPitcher = (player: RosterEntry) => 
  player.eligibleSlots.some(slot => PITCHER_ELIGIBILITY_SLOTS.includes(slot));

interface DailyLineupProps {
  teamId: number | null;
  week: number;
}

interface PlayerStats {
  runs: number;
  homeRuns: number;
  rbis: number;
  stolenBases: number;
  battingAverage: number;
  hits: number;
  atBats: number;
  strikeouts: number;
  wins: number;
  saves: number;
  era: number;
  whip: number;
}

export const DailyLineup: React.FC<DailyLineupProps> = ({ teamId, week }) => {
  const [lineup, setLineup] = useState<RosterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekMeta, setWeekMeta] = useState<WeekMeta | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [playerStats, setPlayerStats] = useState<Record<number, PlayerStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch week meta map and set up day tabs
  useEffect(() => {
    async function fetchWeekMeta() {
      const metaMap = await dataService.getWeekMetaMap();
      const meta = metaMap[week];
      setWeekMeta(meta);
      if (meta && meta.scoringPeriodIds) {
        // Default to today if in this week, else first day
        const today = new Date();
        const weekStart = meta.startISO ? new Date(meta.startISO) : null;
        if (weekStart) {
          const diff = Math.floor((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
          if (diff >= 0 && diff < 7) {
            setSelectedDayIdx(diff);
          } else {
            setSelectedDayIdx(0);
          }
        } else {
          setSelectedDayIdx(0);
        }
      }
    }
    fetchWeekMeta();
  }, [week]);

  // Function to fetch daily stats for players
  const fetchDailyStats = async (rosterData: any[], date: string) => {
    setStatsLoading(true);
    try {
      // Convert ESPN players to our interface
      const espnPlayers: ESPNPlayer[] = rosterData.map(p => ({
        playerId: p.playerId,
        fullName: p.fullName || p.name || 'Unknown',
        teamAbbrev: p.teamAbbrev || p.team?.abbreviation,
        teamId: p.teamId,
        position: p.position,
        lineupSlotId: p.lineupSlotId
      }));

      // Get MLB players for the date
      const mlbPlayersRaw = await mlbStatService.getMLBPlayersForDate(date);
      const mlbPlayers: MLBPlayer[] = mlbPlayersRaw.map(p => ({
        id: p.id,
        fullName: p.fullName,
        team: p.team,
        position: p.position,
        stats: p.stats
      }));

      // Match players using fuzzy matching
      const matches = await playerMatcher.matchPlayers(espnPlayers, mlbPlayers);
      
      // Build stats map
      const statsMap: Record<number, PlayerStats> = {};
      
      for (const match of matches) {
        if (match.mlbPlayer && match.confidence >= 0.5) {
          const stats = match.mlbPlayer.stats;
          const playerId = match.espnPlayer.playerId;
          
          // Initialize stats
          const playerStats: PlayerStats = {
            runs: 0,
            homeRuns: 0,
            rbis: 0,
            stolenBases: 0,
            battingAverage: 0,
            hits: 0,
            atBats: 0,
            strikeouts: 0,
            wins: 0,
            saves: 0,
            era: 0,
            whip: 0
          };

          // Add batting stats
          if (stats && stats.batting) {
            playerStats.runs = Number(stats.batting.runs || 0);
            playerStats.homeRuns = Number(stats.batting.homeRuns || 0);
            playerStats.rbis = Number(stats.batting.rbi || 0);
            playerStats.stolenBases = Number(stats.batting.stolenBases || 0);
            const atBats = Number(stats.batting.atBats || 0);
            const hits = Number(stats.batting.hits || 0);
            playerStats.hits = hits;
            playerStats.atBats = atBats;
            playerStats.battingAverage = atBats > 0 ? hits / atBats : 0;
          }

          // Add pitching stats
          if (stats && stats.pitching) {
            playerStats.strikeouts = Number(stats.pitching.strikeOuts || 0);
            playerStats.wins = Number(stats.pitching.wins || 0);
            playerStats.saves = Number(stats.pitching.saves || 0);
            
            const ip = Number(stats.pitching.inningsPitched || 0);
            const er = Number(stats.pitching.earnedRuns || 0);
            const h = Number(stats.pitching.hits || 0);
            const bb = Number(stats.pitching.baseOnBalls || 0);
            
            playerStats.era = ip > 0 ? (er * 9) / ip : 0;
            playerStats.whip = ip > 0 ? (h + bb) / ip : 0;
          }

          statsMap[playerId] = playerStats;
        }
      }

      setPlayerStats(statsMap);
    } catch (err) {
      console.error('Failed to fetch daily stats:', err);
      setPlayerStats({});
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch lineup for selected day
  useEffect(() => {
    async function fetchLineup() {
      if (!teamId || !weekMeta) return;
      setIsLoading(true);
      setError(null);
      try {
        const scoringPeriodId = weekMeta.scoringPeriodIds[selectedDayIdx];
        const rosterData = await dataService.getTeamRosterForDay(teamId, scoringPeriodId);
        const transformedRoster: RosterEntry[] = rosterData.map((p: any) => ({
          playerId: p.playerId,
          lineupSlotId: p.lineupSlotId,
          status: p.status,
          eligibleSlots: p.eligibleSlots,
          player: {
            id: p.playerId,
            fullName: p.name,
            position: p.position,
            proTeam: p.team,
          },
        }));
        setLineup(transformedRoster);

        // Calculate the date for this day
        if (weekMeta.startISO) {
          const startDate = new Date(weekMeta.startISO);
          const dayDate = new Date(startDate);
          dayDate.setUTCDate(startDate.getUTCDate() + selectedDayIdx);
          const dateStr = dayDate.toISOString().slice(0, 10);
          
          // Fetch daily stats for this date
          await fetchDailyStats(rosterData, dateStr);
        }
      } catch (err) {
        setError('Failed to load lineup. The team roster might be unavailable for this day.');
        setLineup([]);
        setPlayerStats({});
        console.error('Lineup fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchLineup();
  }, [teamId, weekMeta, selectedDayIdx]);

  // Tab UI for days
  const renderDayTabs = () => {
    if (!weekMeta || !weekMeta.startISO) return null;
    return (
      <div className="flex mb-4 gap-2">
        {weekMeta.scoringPeriodIds.map((spid, idx) => {
          // Use the week's actual start date and add days correctly
          const startDate = new Date(weekMeta.startISO!);
          const dayDate = new Date(startDate);
          dayDate.setUTCDate(startDate.getUTCDate() + idx);
          
          const label = `${DAY_LABELS[idx]} ${dayDate.getUTCMonth() + 1}/${dayDate.getUTCDate()}`;
          return (
            <button
              key={spid}
              className={`px-3 py-1 rounded ${selectedDayIdx === idx ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} font-semibold`}
              onClick={() => setSelectedDayIdx(idx)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  const activeStarters = lineup.filter(p => 
    p.lineupSlotId !== BENCH_SLOT_ID && 
    p.lineupSlotId !== IL_SLOT_ID && 
    p.status === 'ACTIVE'
  );
  const benchAndIL = lineup.filter(p => !activeStarters.some(s => s.playerId === p.playerId))
    .sort((a, b) => a.player.fullName.localeCompare(b.player.fullName));
  const starterBatters = activeStarters.filter(p => !isPitcher(p));
  const starterPitchers = activeStarters.filter(p => isPitcher(p));

  const PlayerRow = ({ player, isIL, isBench = false }: { player: RosterEntry; isIL: boolean; isBench?: boolean }) => {
    const displayPosition = isPitcher(player) ? 'P' : player.player.position;
    const stats = playerStats[player.playerId];
    const isPlayerPitcher = isPitcher(player);
    
    return (
      <div className="flex items-center py-1 text-xs border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
        {/* Player name and position */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1">
            {isIL && <span className="text-red-500 font-bold text-xs">IL</span>}
            <span className="font-medium text-sm truncate">{player.player.fullName}</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-1 py-0.5 rounded text-center min-w-[24px]">
              {displayPosition}
            </span>
          </div>
        </div>
        
        {/* Stats columns */}
        {statsLoading ? (
          <div className="text-xs text-gray-400 flex-1">Loading...</div>
        ) : stats ? (
          <>
            {!isPlayerPitcher && (
              <>
                {isBench ? (
                  <>
                    <div className="w-12 text-center text-gray-700">{stats.runs}</div>
                    <div className="w-12 text-center text-gray-700">{stats.homeRuns}</div>
                    <div className="w-14 text-center text-gray-700">{stats.rbis}</div>
                    <div className="w-10 text-center text-gray-700">{stats.stolenBases}</div>
                    <div className="w-14 text-center text-gray-700">{stats.hits}/{stats.atBats}</div>
                    <div className="w-16 text-center text-gray-700">{stats.battingAverage.toFixed(3)}</div>
                  </>
                ) : (
                  <>
                    <div className="w-8 text-center text-gray-700">{stats.runs}</div>
                    <div className="w-8 text-center text-gray-700">{stats.homeRuns}</div>
                    <div className="w-10 text-center text-gray-700">{stats.rbis}</div>
                    <div className="w-8 text-center text-gray-700">{stats.stolenBases}</div>
                    <div className="w-14 text-center text-gray-700">{stats.hits}/{stats.atBats}</div>
                    <div className="w-12 text-center text-gray-700">{stats.battingAverage.toFixed(3)}</div>
                  </>
                )}
              </>
            )}
            {isPlayerPitcher && !isBench && (
              <>
                <div className="w-8 text-center text-gray-700">{stats.strikeouts}</div>
                <div className="w-8 text-center text-gray-700">{stats.wins}</div>
                <div className="w-8 text-center text-gray-700">{stats.saves}</div>
                <div className="w-12 text-center text-gray-700">{stats.era.toFixed(2)}</div>
                <div className="w-12 text-center text-gray-700">{stats.whip.toFixed(2)}</div>
              </>
            )}
            {isPlayerPitcher && isBench && (
              <>
                <div className="w-12 text-center text-gray-700">{stats.strikeouts}</div>
                <div className="w-12 text-center text-gray-700">{stats.wins}</div>
                <div className="w-14 text-center text-gray-700">{stats.saves}</div>
                <div className="w-10 text-center text-gray-700">-</div>
                <div className="w-16 text-center text-gray-700">{stats.era.toFixed(2)}</div>
              </>
            )}
          </>
        ) : (
          <>
            {isBench ? (
              <>
                <div className="w-12 text-center text-gray-400">-</div>
                <div className="w-12 text-center text-gray-400">-</div>
                <div className="w-14 text-center text-gray-400">-</div>
                <div className="w-10 text-center text-gray-400">-</div>
                <div className="w-14 text-center text-gray-400">-</div>
                <div className="w-16 text-center text-gray-400">-</div>
              </>
            ) : (
              <>
                <div className="w-8 text-center text-gray-400">-</div>
                <div className="w-8 text-center text-gray-400">-</div>
                <div className="w-10 text-center text-gray-400">-</div>
                <div className="w-8 text-center text-gray-400">-</div>
                <div className="w-14 text-center text-gray-400">-</div>
                <div className="w-12 text-center text-gray-400">-</div>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderSpinner = () => (
    <div className="flex flex-col items-center justify-center py-8">
      <img src="/loading-ball.gif" alt="Loading..." className="w-16 h-16 mb-2" />
      <span className="text-gray-500">Loading lineup...</span>
    </div>
  );

  return (
    <Card className="bg-white border border-[#8c8c8c] shadow-sm mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users size={20} />
          Daily Lineup
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderDayTabs()}
        {!teamId ? (
          <p className="text-center text-gray-500">Select a team to view their lineup.</p>
        ) : isLoading ? (
          renderSpinner()
        ) : error ? (
          <p className="text-center text-red-500">{error}</p>
        ) : lineup.length === 0 ? (
          <p className="text-center text-gray-500">No active players found for this day.</p>
        ) : (
          <div className="space-y-6">
            {/* Active Starters */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2 text-blue-500" />
                Active Starters
              </h3>
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <h4 className="text-xs text-muted-foreground font-bold mb-2">Batters</h4>
                  {/* Header row for batting stats */}
                  <div className="flex items-center py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
                    <div className="flex-1 min-w-0 pr-2">PLAYER</div>
                    <div className="w-8 text-center">R</div>
                    <div className="w-8 text-center">HR</div>
                    <div className="w-10 text-center">RBI</div>
                    <div className="w-8 text-center">SB</div>
                    <div className="w-14 text-center">H/AB</div>
                    <div className="w-12 text-center">AVG</div>
                  </div>
                  {starterBatters.map((p) => <PlayerRow key={p.player.id} player={p} isIL={false} />)}
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground font-bold mb-2">Pitchers</h4>
                  {/* Header row for pitching stats */}
                  <div className="flex items-center py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
                    <div className="flex-1 min-w-0 pr-2">PLAYER</div>
                    <div className="w-8 text-center">K</div>
                    <div className="w-8 text-center">W</div>
                    <div className="w-8 text-center">SV</div>
                    <div className="w-12 text-center">ERA</div>
                    <div className="w-12 text-center">WHIP</div>
                  </div>
                  {starterPitchers.map((p) => <PlayerRow key={p.player.id} player={p} isIL={false} />)}
                </div>
              </div>
            </div>
            
            {/* Bench and IL */}
            {benchAndIL.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Bench / IL
                </h3>
                {/* Header row for bench/IL players - mixed stats */}
                <div className="flex items-center py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 mb-1">
                  <div className="flex-1 min-w-0 pr-2">PLAYER</div>
                  <div className="w-12 text-center">R / K</div>
                  <div className="w-12 text-center">HR / W</div>
                  <div className="w-14 text-center">RBI / SV</div>
                  <div className="w-10 text-center">SB</div>
                  <div className="w-14 text-center">H/AB</div>
                  <div className="w-16 text-center">AVG / ERA</div>
                </div>
                <div className="space-y-0">
                  {benchAndIL.map((p) => (
                    <PlayerRow key={p.player.id} player={p} isIL={p.lineupSlotId === IL_SLOT_ID || p.status !== 'ACTIVE'} isBench={true} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 