/**
 * Shared mock-fetch helpers for conformance tests.
 * Restores the original `globalThis.fetch` after each `withMockFetch` call.
 */

/**
 * @typedef {{
 *   url: string;
 *   method: string;
 *   headers: Record<string, string>;
 *   body: BodyInit | null | undefined;
 *   init: RequestInit;
 * }} MockFetchCall
 */

/**
 * @param {unknown} data
 * @param {ResponseInit & { headers?: HeadersInit }} [init]
 */
export function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * @param {string} text
 * @param {ResponseInit & { headers?: HeadersInit }} [init]
 */
export function textResponse(text, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain");
  }
  return new Response(text, { ...init, headers });
}

/**
 * @param {number} status
 * @param {BodyInit | null} [body]
 * @param {ResponseInit & { headers?: HeadersInit }} [init]
 */
export function statusResponse(status, body = "", init = {}) {
  return new Response(body, { ...init, status });
}

/**
 * Normalize HeadersInit / plain object into a lowercase-key record.
 * @param {HeadersInit | Record<string, string> | undefined} headers
 * @returns {Record<string, string>}
 */
export function normalizeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      out[String(k).toLowerCase()] = String(v);
    }
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

/**
 * Install a mock fetch for the duration of `fn`.
 * The handler may be a Response, a function returning Response/Promise, or omit
 * (defaults to `jsonResponse({})`).
 *
 * @template T
 * @param {((url: string, init: RequestInit, call: MockFetchCall) => Response | Promise<Response>) | Response | undefined} handler
 * @param {(ctx: { calls: MockFetchCall[] }) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withMockFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  /** @type {MockFetchCall[]} */
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    const headers = normalizeHeaders(init.headers);
    /** @type {MockFetchCall} */
    const call = {
      url,
      method,
      headers,
      body: init.body,
      init,
    };
    calls.push(call);

    if (handler instanceof Response) {
      return handler.clone();
    }
    if (typeof handler === "function") {
      return handler(url, init, call);
    }
    return jsonResponse({});
  };

  try {
    return await fn({ calls });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
