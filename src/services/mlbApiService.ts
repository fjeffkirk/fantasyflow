export class MLBApiService {
  private cache: Map<number, Date[]> = new Map();

  async getSeasonDates(year: number): Promise<Date[]> {
    if (this.cache.has(year)) return this.cache.get(year)!;

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}&gameTypes=R`;
    console.log('[MLB] Fetching season schedule:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[MLB] Failed to fetch schedule ${res.status}`);
    const data = await res.json();
    const datesSet = new Set<string>();
    for (const d of data.dates || []) {
      if (d.date) datesSet.add(d.date);
    }
    const dates: Date[] = Array.from(datesSet).map(ds => new Date(`${ds}T00:00:00Z`));
    dates.sort((a, b) => a.getTime() - b.getTime());
    this.cache.set(year, dates);
    console.log(`[MLB] Loaded ${dates.length} game days for season ${year}`);
    return dates;
  }
}

export const mlbApiService = new MLBApiService(); 