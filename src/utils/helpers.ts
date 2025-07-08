import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PlayerStats, ScoringCategory } from '../types/fantasy';

// Tailwind CSS class merging utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  const start = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start} - ${end}`;
}

// Statistical utilities
export function calculateBattingAverage(hits: number, atBats: number): number {
  return atBats > 0 ? hits / atBats : 0;
}

export function calculateERA(earnedRuns: number, inningsPitched: number): number {
  return inningsPitched > 0 ? (earnedRuns * 9) / inningsPitched : 0;
}

export function calculateWHIP(walks: number, hits: number, inningsPitched: number): number {
  return inningsPitched > 0 ? (walks + hits) / inningsPitched : 0;
}

// Fantasy scoring utilities
export function compareStatCategories(
  team1Stats: PlayerStats,
  team2Stats: PlayerStats,
  categories: ScoringCategory[]
): { [key: string]: 'team1' | 'team2' | 'tie' } {
  const results: { [key: string]: 'team1' | 'team2' | 'tie' } = {};

  categories.forEach((category) => {
    const team1Value = team1Stats[category.key] || 0;
    const team2Value = team2Stats[category.key] || 0;

    if (team1Value === team2Value) {
      results[category.key] = 'tie';
    } else {
      // ERA and WHIP are "lower is better" categories
      const isInverseCategory = category.key === 'era' || category.key === 'whip';
      
      if (isInverseCategory) {
        results[category.key] = team1Value < team2Value ? 'team1' : 'team2';
      } else {
        results[category.key] = team1Value > team2Value ? 'team1' : 'team2';
      }
    }
  });

  return results;
}

export function calculateMatchupScore(categoryResults: { [key: string]: 'team1' | 'team2' | 'tie' }): {
  team1Score: number;
  team2Score: number;
  ties: number;
} {
  let team1Score = 0;
  let team2Score = 0;
  let ties = 0;

  Object.values(categoryResults).forEach((result) => {
    if (result === 'team1') team1Score++;
    else if (result === 'team2') team2Score++;
    else ties++;
  });

  return { team1Score, team2Score, ties };
}

// Number formatting utilities
export function formatStat(value: number, category: string): string {
  switch (category) {
    case 'battingAverage':
    case 'era':
    case 'whip':
      return value.toFixed(3);
    case 'runs':
    case 'homeRuns':
    case 'rbis':
    case 'stolenBases':
    case 'strikeouts':
    case 'wins':
    case 'saves':
      return Math.round(value).toString();
    default:
      return value.toString();
  }
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Array utilities
export function sortTeamsByRecord<T extends { wins: number; losses: number }>(teams: T[]): T[] {
  return teams.sort((a, b) => {
    const aWinPct = a.wins / (a.wins + a.losses || 1);
    const bWinPct = b.wins / (b.wins + b.losses || 1);
    return bWinPct - aWinPct;
  });
}

// Validation utilities
export function validateLeagueId(leagueId: string | number): boolean {
  const id = typeof leagueId === 'string' ? parseInt(leagueId) : leagueId;
  return !isNaN(id) && id > 0;
}

export function validateWeek(week: string | number): boolean {
  const weekNum = typeof week === 'string' ? parseInt(week) : week;
  return !isNaN(weekNum) && weekNum >= 1 && weekNum <= 26;
}

// Local storage utilities
export function saveToLocalStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

export function loadFromLocalStorage<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return null;
  }
}

// Error handling utilities
export function createErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

// API utilities
export function buildQueryString(params: Record<string, string | number | boolean>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  });
  
  return searchParams.toString();
}

export function isValidApiResponse(response: any): boolean {
  return response && typeof response === 'object' && !Array.isArray(response);
}

// Time utilities
export function getCurrentWeek(): number {
  const now = new Date();
  const seasonStart = new Date(`${now.getFullYear()}-03-28`); // MLB season typically starts late March
  const diffTime = Math.abs(now.getTime() - seasonStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.ceil(diffDays / 7);
}

export function getWeekDateRange(week: number, year: number = new Date().getFullYear()): {
  startDate: string;
  endDate: string;
} {
  const seasonStart = new Date(`${year}-03-28`);
  const weekStart = new Date(seasonStart);
  weekStart.setDate(seasonStart.getDate() + (week - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return {
    startDate: weekStart.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0],
  };
}