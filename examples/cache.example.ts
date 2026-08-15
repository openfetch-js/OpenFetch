/**
 * In-memory GET/HEAD cache (TTL + optional stale-while-revalidate).
 *
 * Default cache key is `METHOD fullUrl`. `authorization` and `cookie` are
 * folded into the key unless you pass `varyHeaderNames: []`.
 * For per-user data, keep those headers (or add more) so entries do not leak.
 */

import {
  createCacheMiddleware,
  createClient,
  MemoryCacheStore,
} from "@hamdymohamedak/openfetch";

export function createCachedClient() {
  const store = new MemoryCacheStore({ maxEntries: 200 });

  return createClient({
    baseURL: "https://api.example.com",
    unwrapResponse: true,
  }).use(
    createCacheMiddleware(store, {
      ttlMs: 60_000,
      staleWhileRevalidateMs: 30_000,
      varyHeaderNames: ["authorization", "cookie"],
    })
  );
}

/** Skip cache for a single call (always hits the origin). */
export async function freshUser(client: ReturnType<typeof createCachedClient>) {
  return client.get("/v1/user", {
    memoryCache: { skip: true },
  });
}
