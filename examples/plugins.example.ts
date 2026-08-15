/**
 * Built-in plugins (also importable from `@hamdymohamedak/openfetch/plugins`
 * for tighter tree-shaking).
 *
 * Register `retry` before `timeout` so retries wrap the full inner chain
 * (including per-attempt timeouts).
 */

import {
  createClient,
  debug,
  hooks,
  retry,
  strictFetch,
  timeout,
} from "@hamdymohamedak/openfetch";

export function createResilientClient() {
  return createClient({
    baseURL: "https://api.example.com",
    unwrapResponse: true,
  })
    .use(
      retry({
        attempts: 3,
        retryOnStatus: [408, 429, 500, 502, 503, 504],
        timeoutTotalMs: 15_000,
        timeoutPerAttemptMs: 5_000,
      })
    )
    .use(timeout(5_000))
    .use(strictFetch())
    .use(
      hooks({
        onRequest(ctx) {
          console.debug("→", ctx.request.method, ctx.url);
        },
        onResponse(ctx) {
          console.debug("←", ctx.response?.status, ctx.url);
        },
        onError(_ctx, error) {
          console.debug("✗", error);
        },
      })
    )
    .use(
      debug({
        includeRequestHeaders: true,
        maskHeaders: ["authorization"],
        maskStrategy: "partial",
      })
    );
}

/**
 * Retrying POST: opt in, then a stable `Idempotency-Key` is added automatically
 * when `maxAttempts > 1` (unless you already set one).
 */
export function createIdempotentPoster() {
  return createClient({ baseURL: "https://api.example.com" }).use(
    retry({
      attempts: 3,
      retryNonIdempotentMethods: true,
      autoIdempotencyKey: true,
    })
  );
}
