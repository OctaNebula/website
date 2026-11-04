// Live Roblox stats for the pinned cards. Server-only: this runs inside the
// Node server on the VPS (Roblox's APIs don't send CORS headers, so the
// browser can't call them directly). One shared in-memory cache means
// Roblox gets hit at most once per TTL no matter how many people visit.

// pinned entry id -> Roblox place id
export const robloxPlaces: Record<string, number> = {
  'mafia-pinned': 113232329524315,
  'steel-crossfire-pinned': 133197203959042,
};

export type GameStats = { visits: number; playing: number };
export type StatsSnapshot = {
  updated: string | null; // ISO time of the last successful Roblox fetch
  games: Record<string, GameStats>;
};

const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 4_000;
const COLD_WAIT_MS = 3_000; // longest a page render waits when there's no data yet

const universeIds = new Map<string, number>(); // a place never changes universe
let snapshot: StatsSnapshot = { updated: null, games: {} };
let attemptedAt = 0;
let inflight: Promise<void> | null = null;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

async function refresh(): Promise<void> {
  const lookups = await Promise.allSettled(
    Object.entries(robloxPlaces)
      .filter(([entryId]) => !universeIds.has(entryId))
      .map(async ([entryId, placeId]) => {
        const { universeId } = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
        if (typeof universeId !== 'number') throw new Error(`no universe for place ${placeId}`);
        universeIds.set(entryId, universeId);
      })
  );
  for (const l of lookups) {
    if (l.status === 'rejected') console.error('[roblox] universe lookup failed:', l.reason?.message ?? l.reason);
  }
  if (universeIds.size === 0) throw new Error('could not resolve any universe ids');

  const ids = [...new Set(universeIds.values())].join(',');
  const { data } = await getJson(`https://games.roblox.com/v1/games?universeIds=${ids}`);

  // Match by id: Roblox answers unknown ids with an id-0 "[TITLE UNAVAILABLE]" stub.
  const games: Record<string, GameStats> = {};
  for (const [entryId, universeId] of universeIds) {
    const g = Array.isArray(data) ? data.find((d: any) => d?.id === universeId) : undefined;
    if (g && typeof g.playing === 'number' && typeof g.visits === 'number') {
      games[entryId] = { visits: g.visits, playing: g.playing };
    }
  }
  if (Object.keys(games).length === 0) throw new Error('games response had no usable entries');

  snapshot = { updated: new Date().toISOString(), games: { ...snapshot.games, ...games } };
}

// Stale-while-revalidate: always answer from memory, kick off a refresh in
// the background once the cache is older than TTL_MS. Only a cold start
// (no data yet) waits, and never longer than COLD_WAIT_MS. Failed attempts
// also count toward the TTL so a Roblox outage doesn't get hammered.
export async function getStats(): Promise<StatsSnapshot> {
  if (!inflight && Date.now() - attemptedAt >= TTL_MS) {
    attemptedAt = Date.now();
    inflight = refresh()
      .catch((err) => console.error('[roblox] refresh failed:', err?.message ?? err))
      .finally(() => { inflight = null; });
  }
  if (!snapshot.updated && inflight) {
    await Promise.race([inflight, new Promise((r) => setTimeout(r, COLD_WAIT_MS))]);
  }
  return snapshot;
}
