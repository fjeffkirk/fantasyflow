import Fuse from 'fuse.js';
import { compareTwoStrings } from 'string-similarity';

export interface ESPNPlayer {
  playerId: number;
  fullName: string;
  teamAbbrev?: string;
  teamId?: number;
  position?: string;
  lineupSlotId: number;
}

export interface MLBPlayer {
  id: number;
  fullName: string;
  gamePk?: number;
  team: {
    name: string;
    abbreviation: string;
  };
  position?: {
    code: string;
    name: string;
  };
  stats?: {
    batting?: any;
    pitching?: any;
  };
}

export interface PlayerMatch {
  espnPlayer: ESPNPlayer;
  mlbPlayer: MLBPlayer | null;
  confidence: number;
  matchReason: string;
  warnings?: string[];
}

export class PlayerMatcher {
  private teamAbbreviationMap: Record<string, string> = {
    // MLB team abbreviations to standardized codes
    'LAA': 'LAA', 'HOU': 'HOU', 'OAK': 'OAK', 'TOR': 'TOR', 'ATL': 'ATL',
    'MIL': 'MIL', 'STL': 'STL', 'CHC': 'CHC', 'ARI': 'ARI', 'LAD': 'LAD',
    'SF': 'SF', 'CLE': 'CLE', 'SEA': 'SEA', 'MIA': 'MIA', 'NYM': 'NYM',
    'WSH': 'WSH', 'BAL': 'BAL', 'SD': 'SD', 'PHI': 'PHI', 'PIT': 'PIT',
    'TEX': 'TEX', 'TB': 'TB', 'BOS': 'BOS', 'CIN': 'CIN', 'COL': 'COL',
    'KC': 'KC', 'DET': 'DET', 'MIN': 'MIN', 'CWS': 'CWS', 'NYY': 'NYY',
    // Alternative abbreviations
    'SFG': 'SF', 'WSN': 'WSH', 'TBR': 'TB', 'KCR': 'KC',
    'CHW': 'CWS', 'SDP': 'SD'
  };

  private positionMap: Record<string, string[]> = {
    // ESPN position to MLB position codes
    'C': ['C'],
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    'SS': ['SS'],
    'OF': ['LF', 'CF', 'RF', 'OF'],
    'LF': ['LF', 'OF'],
    'CF': ['CF', 'OF'],
    'RF': ['RF', 'OF'],
    'DH': ['DH'],
    'SP': ['P', 'SP'],
    'RP': ['P', 'RP'],
    'P': ['P', 'SP', 'RP']
  };

  /**
   * Normalize a player name for matching
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z\s]/g, "") // Remove non-letter characters except spaces
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  }

  /**
   * Normalize team abbreviation
   */
  private normalizeTeam(team: string): string {
    const normalized = team.toUpperCase().trim();
    return this.teamAbbreviationMap[normalized] || normalized;
  }

  /**
   * Check if positions are compatible
   */
  private isPositionMatch(espnPosition: string, mlbPosition: string): boolean {
    if (!espnPosition || !mlbPosition) return true; // Skip position check if missing

    const espnPositions = this.positionMap[espnPosition] || [espnPosition];
    return espnPositions.includes(mlbPosition.toUpperCase());
  }

  /**
   * Extract team abbreviation from MLB team name
   */
  private extractTeamAbbrev(mlbTeam: { name: string; abbreviation: string }): string {
    if (mlbTeam.abbreviation) {
      return this.normalizeTeam(mlbTeam.abbreviation);
    }
    
    // Fallback: try to extract from team name
    const teamNameMap: Record<string, string> = {
      'Angels': 'LAA', 'Astros': 'HOU', 'Athletics': 'OAK', 'Blue Jays': 'TOR',
      'Braves': 'ATL', 'Brewers': 'MIL', 'Cardinals': 'STL', 'Cubs': 'CHC',
      'Diamondbacks': 'ARI', 'Dodgers': 'LAD', 'Giants': 'SF', 'Guardians': 'CLE',
      'Mariners': 'SEA', 'Marlins': 'MIA', 'Mets': 'NYM', 'Nationals': 'WSH',
      'Orioles': 'BAL', 'Padres': 'SD', 'Phillies': 'PHI', 'Pirates': 'PIT',
      'Rangers': 'TEX', 'Rays': 'TB', 'Red Sox': 'BOS', 'Reds': 'CIN',
      'Rockies': 'COL', 'Royals': 'KC', 'Tigers': 'DET', 'Twins': 'MIN',
      'White Sox': 'CWS', 'Yankees': 'NYY'
    };

    for (const [name, abbrev] of Object.entries(teamNameMap)) {
      if (mlbTeam.name.includes(name)) {
        return abbrev;
      }
    }

    return mlbTeam.name.substring(0, 3).toUpperCase();
  }

  /**
   * Match ESPN players to MLB players using fuzzy matching
   */
  async matchPlayers(espnPlayers: ESPNPlayer[], mlbPlayers: MLBPlayer[]): Promise<PlayerMatch[]> {
    console.log(`🔍 [PlayerMatcher] Matching ${espnPlayers.length} ESPN players to ${mlbPlayers.length} MLB players`);
    
    const matches: PlayerMatch[] = [];
    const usedMLBPlayers = new Set<number>();

    // Create Fuse instance for fuzzy searching
    const fuse = new Fuse(mlbPlayers, {
      keys: ['fullName'],
      threshold: 0.4, // Lower = more strict matching
      includeScore: true
    });

    for (const espnPlayer of espnPlayers) {
      console.log(`🔍 [PlayerMatcher] Matching ESPN player: ${espnPlayer.fullName} (${espnPlayer.teamAbbrev})`);
      
      const normalizedESPNName = this.normalizeName(espnPlayer.fullName);
      const espnTeam = this.normalizeTeam(espnPlayer.teamAbbrev || '');
      
      let bestMatch: PlayerMatch = {
        espnPlayer,
        mlbPlayer: null,
        confidence: 0,
        matchReason: 'No match found',
        warnings: []
      };

      // Strategy 1: Exact name match with team verification
      for (const mlbPlayer of mlbPlayers) {
        if (usedMLBPlayers.has(mlbPlayer.id)) continue;

        const normalizedMLBName = this.normalizeName(mlbPlayer.fullName);
        const mlbTeam = this.extractTeamAbbrev(mlbPlayer.team);
        
        if (normalizedESPNName === normalizedMLBName) {
          const teamMatch = espnTeam === mlbTeam;
          const positionMatch = this.isPositionMatch(espnPlayer.position || '', mlbPlayer.position?.code || '');
          
          let confidence = 0.9;
          let matchReason = 'Exact name match';
          const warnings: string[] = [];

          if (teamMatch) {
            confidence += 0.1;
            matchReason += ' + team match';
          } else if (espnTeam && mlbTeam) {
            confidence -= 0.2;
            warnings.push(`Team mismatch: ESPN(${espnTeam}) vs MLB(${mlbTeam})`);
          }

          if (!positionMatch) {
            warnings.push(`Position mismatch: ESPN(${espnPlayer.position}) vs MLB(${mlbPlayer.position?.code})`);
          }

          if (confidence > bestMatch.confidence) {
            bestMatch = {
              espnPlayer,
              mlbPlayer,
              confidence,
              matchReason,
              warnings
            };
          }
        }
      }

      // Strategy 2: Fuzzy name matching with team filter
      if (bestMatch.confidence < 0.8) {
        const fuzzyResults = fuse.search(normalizedESPNName);
        
        for (const result of fuzzyResults.slice(0, 5)) { // Check top 5 matches
          const mlbPlayer = result.item;
          if (usedMLBPlayers.has(mlbPlayer.id)) continue;

          const mlbTeam = this.extractTeamAbbrev(mlbPlayer.team);
          const teamMatch = espnTeam === mlbTeam;
          const positionMatch = this.isPositionMatch(espnPlayer.position || '', mlbPlayer.position?.code || '');
          
          // Calculate confidence based on name similarity and other factors
          const nameScore = 1 - (result.score || 0); // Fuse score is lower = better
          const stringSimilarity = compareTwoStrings(normalizedESPNName, this.normalizeName(mlbPlayer.fullName));
          const nameSimilarity = Math.max(nameScore, stringSimilarity);
          
          let confidence = nameSimilarity * 0.7; // Base confidence from name match
          let matchReason = `Fuzzy name match (${(nameSimilarity * 100).toFixed(1)}%)`;
          const warnings: string[] = [];

          if (teamMatch) {
            confidence += 0.2;
            matchReason += ' + team match';
          } else if (espnTeam && mlbTeam) {
            confidence -= 0.1;
            warnings.push(`Team mismatch: ESPN(${espnTeam}) vs MLB(${mlbTeam})`);
          }

          if (positionMatch) {
            confidence += 0.1;
          } else {
            warnings.push(`Position mismatch: ESPN(${espnPlayer.position}) vs MLB(${mlbPlayer.position?.code})`);
          }

          if (confidence > bestMatch.confidence && confidence > 0.5) {
            bestMatch = {
              espnPlayer,
              mlbPlayer,
              confidence,
              matchReason,
              warnings
            };
          }
        }
      }

      // Mark the matched MLB player as used
      if (bestMatch.mlbPlayer) {
        usedMLBPlayers.add(bestMatch.mlbPlayer.id);
      }

      matches.push(bestMatch);
      
      // Log the match result
      if (bestMatch.mlbPlayer) {
        console.log(`✅ [PlayerMatcher] Matched: ${espnPlayer.fullName} → ${bestMatch.mlbPlayer.fullName} (${(bestMatch.confidence * 100).toFixed(1)}%)`);
        if (bestMatch.warnings?.length) {
          console.warn(`⚠️ [PlayerMatcher] Warnings: ${bestMatch.warnings.join(', ')}`);
        }
      } else {
        console.warn(`❌ [PlayerMatcher] No match found for: ${espnPlayer.fullName} (${espnPlayer.teamAbbrev})`);
      }
    }

    // Summary
    const matched = matches.filter(m => m.mlbPlayer !== null);
    const highConfidence = matched.filter(m => m.confidence >= 0.8);
    const lowConfidence = matched.filter(m => m.mlbPlayer && m.confidence < 0.8);
    
    console.log(`📊 [PlayerMatcher] Summary: ${matched.length}/${espnPlayers.length} matched`);
    console.log(`📊 [PlayerMatcher] High confidence (≥80%): ${highConfidence.length}`);
    console.log(`📊 [PlayerMatcher] Low confidence (<80%): ${lowConfidence.length}`);
    console.log(`📊 [PlayerMatcher] Unmatched: ${espnPlayers.length - matched.length}`);

    return matches;
  }
}

export const playerMatcher = new PlayerMatcher(); 