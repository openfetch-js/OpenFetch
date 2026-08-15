/**
 * Fluent client (`@hamdymohamedak/openfetch/sugar`): lazy chain, then a terminal.
 *
 * `.get()` / `.post()` only build config.
 * Each terminal (`.json()`, `.text()`, `.send()`, `.raw()`, …) starts a new
 * HTTP request unless you call `.memo()` first.
 */

import { createFluentClient, retry, timeout } from "@hamdymohamedak/openfetch";

export function createApi() {
  return createFluentClient({ baseURL: "https://api.example.com" })
    .use(retry({ attempts: 3 }))
    .use(timeout(5_000));
}

export async function readJson() {
  const api = createApi();
  return api("/v1/user").json<{ id: string }>();
}

/** Native `Response` with an unread body (skips adapter parse / transformResponse). */
export async function downloadBlob() {
  const api = createApi();
  const res = await api("/v1/export").get().raw();
  return res.blob();
}

/**
 * One HTTP round-trip, body buffered once — not an HTTP cache.
 * Without `.memo()`, `.json()` then `.text()` would be two fetches.
 */
export async function parseTwice() {
  const api = createApi();
  const memoed = api("/v1/profile").get().memo();
  const profile = await memoed.json();
  const rawText = await memoed.text();
  return { profile, rawText };
}

/** Full `OpenFetchResponse` without unwrapping `data`. */
export async function sendForStatus() {
  const api = createApi();
  const { status, headers, data } = await api("/v1/health").get().send();
  return { status, headers, data };
}
