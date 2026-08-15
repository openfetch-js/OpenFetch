/**
 * Quick start — default instance, named client, verbs, and common config.
 *
 * Copy into a Node 18+ / Bun / Deno file. Install:
 *   npm install @hamdymohamedak/openfetch
 */

import openFetch, { createClient } from "@hamdymohamedak/openfetch";

/** One-off call on the shared default instance. */
export async function oneOffGet() {
  const { data, status, headers } = await openFetch.get(
    "https://api.example.com/v1/users"
  );
  return { data, status, headers };
}

/**
 * Reusable client: shared `baseURL`, headers, timeout, and unwrapped `data`.
 * `unwrapResponse: true` returns the parsed body instead of `{ data, status, headers }`.
 */
export function createApiClient(token: string) {
  return createClient({
    baseURL: "https://api.example.com",
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
    unwrapResponse: true,
  });
}

export async function crud(token: string) {
  const api = createApiClient(token);

  const users = await api.get("/v1/users", {
    params: { page: 1, limit: 20 },
  });

  const created = await api.post("/v1/users", { name: "Ada" });
  const updated = await api.patch("/v1/users/1", { name: "Ada Lovelace" });
  await api.delete("/v1/users/1");

  return { users, created, updated };
}

/**
 * Per-request overrides still merge with client defaults.
 * `auth` maps to an HTTP Basic `Authorization` header.
 * `assertSafeUrl` blocks literal private/loopback IPs on the resolved URL
 * (server-side; does not fix DNS rebinding — see SECURITY.md).
 */
export async function perRequestOverrides() {
  const api = createClient({
    baseURL: "https://httpbin.org",
    timeout: 8_000,
    assertSafeUrl: true,
  });

  return api.get("/basic-auth/user/pass", {
    auth: { username: "user", password: "pass" },
    params: { verbose: 1 },
    unwrapResponse: true,
  });
}
