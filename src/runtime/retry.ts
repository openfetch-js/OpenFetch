import { OpenFetchError } from "../domain/error.js";
import { OpenFetchForceRetry } from "../domain/forceRetry.js";
import type {
  Middleware,
  OpenFetchConfig,
  OpenFetchContext,
  OpenFetchRetryOptions,
} from "../domain/types.js";
import { buildURL } from "../shared/buildURL.js";
import {
  classifyRetryReason,
  emitOpenFetchDebug,
  setOpenFetchDebugAttempt,
} from "../shared/openFetchDebug.js";
import {
  ensureIdempotencyKeyHeader,
  generateIdempotencyKey,
  hasIdempotencyKeyHeader,
} from "../shared/idempotencyKey.js";
import { mergeAbortSignals } from "../shared/mergeAbortSignals.js";

const DEFAULT_RETRY_ON_STATUS = [408, 429, 500, 502, 503, 504];

/** Monotonic elapsed ms; falls back to `Date.now()` if `performance` is missing. */
function monotonicNowMs(): number {
  const perf = globalThis.performance;
  if (perf != null && typeof perf.now === "function") {
    return perf.now();
  }
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Backoff that ends early when `signal` aborts (no need to wait full delay). */
async function sleepBackoff(ms: number, ctx: OpenFetchContext): Promise<void> {
  const sig = ctx.request.signal;
  if (sig == null) {
    await sleep(ms);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let id: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (id !== undefined) clearTimeout(id);
      const err = new OpenFetchError("Request aborted", {
        config: ctx.request,
        code: "ERR_CANCELED",
        request: { url: resolveRetryRequestUrl(ctx) },
      });
      ctx.error = err;
      reject(err);
    };
    if (sig.aborted) {
      onAbort();
      return;
    }
    id = setTimeout(() => {
      sig.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    sig.addEventListener("abort", onAbort, { once: true });
  });
}

type ResolvedRetry = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  retryOnStatus: number[];
  retryOnNetworkError: boolean;
  retryNonIdempotentMethods: boolean;
  autoIdempotencyKey: boolean;
  timeoutTotalMs?: number;
  /** When false, total budget is not merged into `signal` (only checked between attempts). */
  enforceTotalTimeout: boolean;
  timeoutPerAttemptMs?: number;
  shouldRetry?: OpenFetchRetryOptions["shouldRetry"];
  onBeforeRetry?: OpenFetchRetryOptions["onBeforeRetry"];
  onAfterResponse?: OpenFetchRetryOptions["onAfterResponse"];
};

function computeDelayMs(attemptIndex: number, ro: ResolvedRetry): number {
  const raw = ro.baseDelayMs * ro.factor ** Math.max(0, attemptIndex - 1);
  const capped = Math.min(raw, ro.maxDelayMs);
  const jitter = capped * 0.25 * Math.random();
  return Math.round(capped + jitter);
}

function resolveRetryOptions(
  ctx: OpenFetchConfig,
  factoryDefaults?: OpenFetchRetryOptions
): ResolvedRetry {
  const r = { ...factoryDefaults, ...ctx.retry };
  return {
    maxAttempts: r.maxAttempts ?? 3,
    baseDelayMs: r.baseDelayMs ?? 300,
    maxDelayMs: r.maxDelayMs ?? 30_000,
    factor: r.factor ?? 2,
    retryOnStatus: r.retryOnStatus ?? DEFAULT_RETRY_ON_STATUS,
    retryOnNetworkError: r.retryOnNetworkError ?? true,
    retryNonIdempotentMethods: r.retryNonIdempotentMethods ?? false,
    autoIdempotencyKey: r.autoIdempotencyKey !== false,
    timeoutTotalMs: r.timeoutTotalMs,
    enforceTotalTimeout: r.enforceTotalTimeout !== false,
    timeoutPerAttemptMs: r.timeoutPerAttemptMs,
    shouldRetry: r.shouldRetry,
    onBeforeRetry: r.onBeforeRetry,
    onAfterResponse: r.onAfterResponse,
  };
}

/** Stable key across retry attempts for POST + non-idempotent retry mode. */
function applyPostIdempotencyKey(
  request: OpenFetchConfig,
  ro: ResolvedRetry
): void {
  if (ro.maxAttempts <= 1) return;
  if (!ro.autoIdempotencyKey) return;
  if (!ro.retryNonIdempotentMethods) return;
  const m = (request.method ?? "GET").toUpperCase();
  if (m !== "POST") return;
  if (hasIdempotencyKeyHeader(request.headers)) return;
  const key = generateIdempotencyKey();
  request.headers = ensureIdempotencyKeyHeader(request.headers, key);
}

/** Methods safe to retry on ambiguous failure without opt-in. */
function isSafeRetryMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS" || m === "TRACE";
}

function allowRetryForRequest(ro: ResolvedRetry, request: OpenFetchConfig): boolean {
  if (ro.retryNonIdempotentMethods) return true;
  return isSafeRetryMethod(request.method);
}

function resolveRetryRequestUrl(ctx: OpenFetchContext): string {
  const u = ctx.request.url;
  if (u === undefined || u === "") return "";
  try {
    return buildURL(u as string | URL, ctx.request);
  } catch {
    return String(u);
  }
}

/**
 * Stops the retry loop immediately when the caller's `signal` is already aborted
 * (no further `next()` / backoff after `controller.abort()`).
 */
function throwIfExternalAborted(ctx: OpenFetchContext): void {
  const sig = ctx.request.signal;
  if (sig == null || typeof sig !== "object" || !sig.aborted) return;
  const err = new OpenFetchError("Request aborted", {
    config: ctx.request,
    code: "ERR_CANCELED",
    request: { url: resolveRetryRequestUrl(ctx) },
  });
  ctx.error = err;
  throw err;
}

function throwRetryDeadlineExceeded(ctx: OpenFetchContext): never {
  const err = new OpenFetchError("Retry deadline exceeded", {
    config: ctx.request,
    code: "ERR_RETRY_TIMEOUT",
    request: { url: resolveRetryRequestUrl(ctx) },
  });
  ctx.error = err;
  throw err;
}

function assertWithinRetryDeadline(
  ctx: OpenFetchContext,
  deadlineMono: number | null
): void {
  if (deadlineMono == null) return;
  if (monotonicNowMs() >= deadlineMono) {
    throwRetryDeadlineExceeded(ctx);
  }
}

async function builtinShouldRetry(
  err: unknown,
  ro: ResolvedRetry,
  request: OpenFetchConfig
): Promise<boolean> {
  if (err instanceof OpenFetchForceRetry) {
    return true;
  }
  if (err instanceof OpenFetchError) {
    if (err.code === "ERR_CANCELED" || err.code === "ERR_RETRY_TIMEOUT") {
      return false;
    }
    if (err.code === "ERR_BAD_RESPONSE" && err.response) {
      if (!ro.retryOnStatus.includes(err.response.status)) return false;
      return allowRetryForRequest(ro, err.config ?? request);
    }
    if (err.code === "ERR_NETWORK" || err.code === "ERR_PARSE") {
      if (!ro.retryOnNetworkError) return false;
      return allowRetryForRequest(ro, err.config ?? request);
    }
    return false;
  }
  if (!ro.retryOnNetworkError) return false;
  return allowRetryForRequest(ro, request);
}

/**
 * Middleware: re-invokes `next()` on retryable failures with exponential backoff.
 * Honors merged `ctx.request.retry` (defaults + per-request).
 * By default, retries after network/parse failures or configured HTTP statuses only for GET, HEAD, OPTIONS, and TRACE.
 * Set `retry.retryNonIdempotentMethods: true` (client defaults or per request) to retry POST/PUT/PATCH/DELETE as well.
 *
 * With `retryNonIdempotentMethods` and `maxAttempts > 1`, POST requests get a stable `Idempotency-Key` header
 * (if unset) so servers can deduplicate retried writes. Disable with `retry.autoIdempotencyKey: false`.
 *
 * If `request.signal` is aborted (e.g. user called `controller.abort()`), no further attempts or backoff run.
 *
 * `retry.timeoutTotalMs` caps elapsed time for the whole sequence using a monotonic clock (`performance.now()`)
 * when available. With `retry.enforceTotalTimeout !== false` (default), each attempt merges a deadline into
 * `request.signal` so an in-flight `fetch` aborts when the budget is exhausted. Set `enforceTotalTimeout: false`
 * to enforce the budget only between attempts. On expiry throws `OpenFetchError` with code `ERR_RETRY_TIMEOUT`.
 * `retry.timeoutPerAttemptMs` overrides `request.timeout` for each attempt when set.
 */
export function createRetryMiddleware(
  factoryDefaults?: OpenFetchRetryOptions
): Middleware {
  return async (ctx, next) => {
    const ro = resolveRetryOptions(ctx.request, factoryDefaults);
    let attempt = 0;
    const deadlineMono =
      ro.timeoutTotalMs != null && ro.timeoutTotalMs > 0
        ? monotonicNowMs() + ro.timeoutTotalMs
        : null;
    const enforceTotalAbort =
      deadlineMono != null && ro.enforceTotalTimeout;

    while (true) {
      attempt += 1;
      throwIfExternalAborted(ctx);
      assertWithinRetryDeadline(ctx, deadlineMono);
      emitOpenFetchDebug(ctx.request, "attempt_start", {
        attempt,
        maxAttempts: ro.maxAttempts,
      });
      setOpenFetchDebugAttempt(ctx.request, attempt);
      try {
        if (ro.timeoutPerAttemptMs != null && ro.timeoutPerAttemptMs > 0) {
          ctx.request.timeout = ro.timeoutPerAttemptMs;
        }
        applyPostIdempotencyKey(ctx.request, ro);

        const finalizeSuccess = async (): Promise<void> => {
          if (ctx.response != null && ro.onAfterResponse) {
            await ro.onAfterResponse(ctx, ctx.response);
          }
        };

        if (deadlineMono == null) {
          await next();
          await finalizeSuccess();
          return;
        }

        if (!enforceTotalAbort) {
          assertWithinRetryDeadline(ctx, deadlineMono);
          await next();
          await finalizeSuccess();
          return;
        }

        const userSig = ctx.request.signal ?? null;
        const remaining = deadlineMono - monotonicNowMs();
        if (remaining <= 0) throwRetryDeadlineExceeded(ctx);

        const deadlineAc = new AbortController();
        const deadlineTimer = setTimeout(() => {
          deadlineAc.abort();
        }, remaining);
        ctx.request.signal = mergeAbortSignals(userSig ?? undefined, deadlineAc);

        try {
          await next();
        } catch (e) {
          if (deadlineAc.signal.aborted && !(userSig?.aborted ?? false)) {
            throwRetryDeadlineExceeded(ctx);
          }
          throw e;
        } finally {
          clearTimeout(deadlineTimer);
          ctx.request.signal = userSig;
        }
        await finalizeSuccess();
        return;
      } catch (err) {
        if (attempt >= ro.maxAttempts) {
          ctx.error = err;
          throw err;
        }
        const baseOk = await builtinShouldRetry(err, ro, ctx.request);
        const customOk =
          ro.shouldRetry != null ? await ro.shouldRetry(err, attempt) : true;
        if (!baseOk || !customOk) {
          ctx.error = err;
          throw err;
        }
        if (ro.onBeforeRetry) {
          await ro.onBeforeRetry(ctx, { attempt, error: err });
        }
        throwIfExternalAborted(ctx);
        assertWithinRetryDeadline(ctx, deadlineMono);
        const delay = computeDelayMs(attempt, ro);
        const sleepMs =
          deadlineMono == null
            ? delay
            : Math.min(
                delay,
                Math.max(0, deadlineMono - monotonicNowMs())
              );
        if (err instanceof OpenFetchForceRetry) {
          emitOpenFetchDebug(ctx.request, "hook_after_response", {
            hook: "onAfterResponse",
            action: "force_retry",
          });
        }
        emitOpenFetchDebug(ctx.request, "retry", {
          failedAttempt: attempt,
          nextAttempt: attempt + 1,
          reason: classifyRetryReason(err),
          delayMs: sleepMs,
        });
        await sleepBackoff(sleepMs, ctx);
      }
    }
  };
}
