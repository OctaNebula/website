import type { APIRoute } from 'astro';
import { getStats } from '../../lib/roblox';

export const prerender = false;

// Polled by the home page every 30s to keep the pinned cards' counts live.
export const GET: APIRoute = async () => {
  const stats = await getStats();
  return new Response(JSON.stringify(stats), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
};
