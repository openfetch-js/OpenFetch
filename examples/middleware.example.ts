/**
 * Custom middleware wraps the fetch adapter (after request interceptors).
 *
 * First `use()` is the outer shell. Its `next()` enters the next middleware;
 * the last `next()` runs the built-in dispatch (`fetch` + parse).
 */

import { createClient } from "@hamdymohamedak/openfetch";
import type { Middleware } from "@hamdymohamedak/openfetch";

const withRequestId: Middleware = async (ctx, next) => {
  const headers = { ...(ctx.request.headers ?? {}) };
  if (!headers["x-request-id"] && !headers["X-Request-Id"]) {
    headers["x-request-id"] = crypto.randomUUID();
  }
  ctx.request.headers = headers;
  await next();
};

const timing: Middleware = async (ctx, next) => {
  const t0 = performance.now();
  try {
    await next();
  } finally {
    const ms = Math.round(performance.now() - t0);
    const method = (ctx.request.method ?? "GET").toUpperCase();
    console.debug(`[openfetch] ${method} ${String(ctx.url)} ${ms}ms`);
  }
};

export function createObservedClient() {
  return createClient({
    baseURL: "https://api.example.com",
    unwrapResponse: true,
  })
    .use(timing)
    .use(withRequestId);
}
