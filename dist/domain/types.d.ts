import type { InterceptorManager } from "./interceptors.js";
import type { StandardSchemaV1 } from "./standardSchema.js";
/** Called by middleware to continue the chain (may run the next middleware or the core fetch). */
export type NextFn = () => Promise<void>;
export type TransformRequest = (data: unknown, headers: Record<string, string>) => unknown | Promise<unknown>;
export type TransformResponse<T = unknown> = (data: unknown) => T | Promise<T>;
/** Structured record emitted when {@link OpenFetchConfig.debug} is enabled. */
export type OpenFetchDebugEvent = {
    stage: string;
    timestamp: number;
} & Record<string, unknown>;
/** Per-request overrides for the memory cache middleware. */
export type OpenFetchMemoryCacheRequestOptions = {
    ttlMs?: number;
    staleWhileRevalidateMs?: number;
    /** Bypass memory cache read/write for this request. */
    skip?: boolean;
};
/** Byte progress for {@link OpenFetchConfig.onUploadProgress} / {@link OpenFetchConfig.onDownloadProgress}. */
export type OpenFetchProgressEvent = {
    /** Bytes read from the response body or consumed from the request body so far. */
    transferredBytes: number;
    /**
     * Known total when available (`Content-Length` for downloads; measured body size for common upload types).
     * `null` when unknown (e.g. chunked transfer, user-provided `ReadableStream` upload without length).
     */
    totalBytes: number | null;
    /** 0–100 when `totalBytes` is a positive number; otherwise `null` (unknown total). */
    percent: number | null;
};
export type OpenFetchConfig = {
    url?: string | URL;
    baseURL?: string;
    method?: string;
    headers?: Record<string, string>;
    /** Request payload; merged into fetch `body` after transforms. */
    data?: unknown;
    body?: BodyInit | null;
    params?: Record<string, unknown>;
    paramsSerializer?: (params: Record<string, unknown>) => string;
    signal?: AbortSignal | null;
    /** Per-request `fetch` timeout (ms); each retry attempt uses a fresh timer in `dispatch`. */
    timeout?: number;
    /** Maps to `credentials: 'include'` when true unless `credentials` is set. */
    withCredentials?: boolean;
    auth?: {
        username: string;
        password: string;
    };
    /**
     * When true, the fully resolved request URL (after `baseURL` / `params`) is checked with
     * `assertSafeHttpUrl` before `fetch`. Use for server-side calls where the URL may be influenced
     * by untrusted input; does not mitigate DNS rebinding to private IPs.
     */
    assertSafeUrl?: boolean;
    responseType?: "arraybuffer" | "blob" | "json" | "text" | "stream";
    /**
     * When true, the native `Response` is returned as `data` without reading the body (for `.json()` / `.text()` etc.).
     * The dispatch-layer **body parse** and **`transformResponse` chain are skipped** (escape hatch). Client
     * **response interceptors** still run and receive `OpenFetchResponse` whose `data` is that `Response`.
     * Middleware that assumes parsed or transformed `ctx.response.data` will not see those transforms—use
     * `.send()` / normal terminals, or read and parse the `Response` yourself (see `cloneResponse`).
     */
    rawResponse?: boolean;
    /**
     * When set, it **overrides** {@link throwHttpErrors} for this request. Returns `true` if the HTTP status
     * should be treated as success (no `ERR_BAD_RESPONSE`).
     */
    validateStatus?: (status: number) => boolean;
    /**
     * Ky-style gate when {@link validateStatus} is **omitted**: `false` means never throw on HTTP status;
     * a function receives the status and should return `true` to **throw** an HTTP error for that status.
     * Ignored when `validateStatus` is provided.
     */
    throwHttpErrors?: boolean | ((status: number) => boolean);
    /**
     * After a successful status check, validate parsed JSON with a [Standard Schema](https://github.com/standard-schema/standard-schema)
     * (e.g. Zod 3.24+). Throws `SchemaValidationError` on failure.
     */
    jsonSchema?: StandardSchemaV1;
    /**
     * Synchronous hooks on the merged config before URL resolution / `fetch` (mutate in place if needed).
     */
    init?: Array<(config: OpenFetchConfig) => void>;
    transformRequest?: TransformRequest[];
    transformResponse?: TransformResponse[];
    middlewares?: Middleware[];
    /** Merged shallowly: defaults + per-request. Used by `createRetryMiddleware`. */
    retry?: OpenFetchRetryOptions;
    /** Per-request memory cache hints when using `createCacheMiddleware`. */
    memoryCache?: OpenFetchMemoryCacheRequestOptions;
    /**
     * When true, `get`/`post`/… return `response.data` only (ergonomic for RSC).
     * Default false — return full `OpenFetchResponse`.
     */
    unwrapResponse?: boolean;
    /**
     * DevTools-style lifecycle logging. `true` / `"verbose"` emit structured events for the full
     * pipeline (merge, fetch, retries, parse, schema). `"basic"` logs `request`, final `response`,
     * and `error` only. Events go to {@link OpenFetchConfig.logger} or `console.debug`.
     */
    debug?: boolean | "basic" | "verbose";
    /** Custom sink for structured {@link OpenFetchDebugEvent} records when `debug` is enabled. */
    logger?: (log: OpenFetchDebugEvent) => void;
    /**
     * Called as the **request** body is read by `fetch` (bytes leaving the client).
     * Best-effort: `FormData` and other bodies that cannot be wrapped as a counting stream are unchanged — no events.
     */
    onUploadProgress?: (event: OpenFetchProgressEvent) => void;
    /**
     * Called as the **response** body is read. `totalBytes` / `percent` use `Content-Length` when present;
     * otherwise `totalBytes` and `percent` stay `null` while `transferredBytes` still increases.
     */
    onDownloadProgress?: (event: OpenFetchProgressEvent) => void;
    /**
     * Node.js (Undici): forwarded to `fetch` when the runtime supports it (Undici `dispatcher` option).
     * Use for custom agents, proxies, or HTTP/2 — e.g. `new Agent({ allowH2: true })` from `undici`.
     * When set, it takes precedence over {@link allowH2}.
     */
    dispatcher?: unknown;
    /**
     * Node.js: shorthand for Undici `new Agent({ allowH2: true })` passed as `fetch(..., { dispatcher })`.
     * Requires the `undici` package to be installed (optional peer). Ignored when {@link dispatcher} is set.
     * No-op / may be ignored on runtimes whose `fetch` does not accept `dispatcher` (e.g. browsers).
     */
    allowH2?: boolean;
} & Partial<Pick<RequestInit, "cache" | "credentials" | "integrity" | "keepalive" | "mode" | "redirect" | "referrer" | "referrerPolicy">>;
export type OpenFetchResponse<T = unknown> = {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: OpenFetchConfig;
};
export type OpenFetchContext = {
    url: string | URL;
    request: OpenFetchConfig;
    response: OpenFetchResponse | null;
    error: unknown;
};
/** Exponential backoff retry (merged from defaults + per-request). */
export type OpenFetchRetryOptions = {
    /** Total attempts including the first try. Default 3. */
    maxAttempts?: number;
    /** Base delay in ms before first retry. Default 300. */
    baseDelayMs?: number;
    /** Cap for backoff delay. Default 30_000. */
    maxDelayMs?: number;
    /** Multiplier each attempt. Default 2. */
    factor?: number;
    /** HTTP status codes that trigger a retry when `validateStatus` failed. */
    retryOnStatus?: number[];
    /** Retry when no response / network failure. Default true. */
    retryOnNetworkError?: boolean;
    /**
     * When true, network/parse failures and retryable HTTP statuses are retried for any method (e.g. POST).
     * Default false: only GET, HEAD, OPTIONS, and TRACE are retried for those cases to avoid duplicate side effects.
     */
    retryNonIdempotentMethods?: boolean;
    /**
     * When true (default), POST requests that use retry with `retryNonIdempotentMethods` and `maxAttempts > 1`
     * get a stable `Idempotency-Key` header (if not already set) so retries share the same key (e.g. Stripe-style APIs).
     * Set false to manage the header yourself.
     */
    autoIdempotencyKey?: boolean;
    /** Optional custom gate (runs after built-in rules). */
    shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
    /**
     * Budget for the whole retry sequence (first attempt through backoff), in ms, measured with a **monotonic**
     * clock (`performance.now()` when available) so elapsed time is stable if the system clock jumps.
     * When `enforceTotalTimeout` is true (default), the budget is also merged into `signal` per attempt so an
     * in-flight `fetch` aborts at expiry (user abort still wins). Set `enforceTotalTimeout: false` to only enforce
     * the budget between attempts (a slow in-flight request may exceed it). On expiry throws `OpenFetchError`
     * with code `ERR_RETRY_TIMEOUT`.
     */
    timeoutTotalMs?: number;
    /**
     * When `timeoutTotalMs` is set: if true (default), each attempt merges a deadline `AbortSignal` so the
     * current `fetch` aborts when the total budget is exhausted. If false, checks run only between attempts.
     */
    enforceTotalTimeout?: boolean;
    /**
     * If set, overrides `request.timeout` for each attempt inside this retry middleware (per-attempt `fetch` timeout).
     * Unset leaves `timeout` from merged request config (or the `timeout()` plugin).
     */
    timeoutPerAttemptMs?: number;
    /**
     * Called after a failed attempt, before backoff (attempt ≥ 2). Wired by `hooks()` when `onBeforeRetry` is set.
     */
    onBeforeRetry?: (ctx: OpenFetchContext, info: {
        attempt: number;
        error: unknown;
    }) => void | Promise<void>;
    /**
     * Called after a successful inner `fetch` when `ctx.response` is set. Throw `OpenFetchForceRetry`
     * to force another attempt (handled by `createRetryMiddleware`).
     */
    onAfterResponse?: (ctx: OpenFetchContext, response: OpenFetchResponse) => void | Promise<void>;
};
export type Middleware = (ctx: OpenFetchContext, next: NextFn) => Promise<void>;
export type OpenFetchInterceptors = {
    request: InterceptorManager<OpenFetchConfig>;
    response: InterceptorManager<OpenFetchResponse>;
};
export type RequestConfig = OpenFetchConfig & {
    url: string | URL;
};
export type OpenFetchClient = {
    defaults: OpenFetchConfig;
    interceptors: OpenFetchInterceptors;
    request: <T = unknown>(urlOrConfig: string | URL | Request | RequestConfig, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    get: <T = unknown>(url: string | URL, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    post: <T = unknown>(url: string | URL, data?: unknown, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    put: <T = unknown>(url: string | URL, data?: unknown, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    patch: <T = unknown>(url: string | URL, data?: unknown, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    delete: <T = unknown>(url: string | URL, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    head: <T = unknown>(url: string | URL, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    options: <T = unknown>(url: string | URL, config?: OpenFetchConfig) => Promise<OpenFetchResponse<T> | T>;
    /** Register middleware (runs around the fetch adapter after request interceptors). Returns the same client for chaining. */
    use: (fn: Middleware) => OpenFetchClient;
};
//# sourceMappingURL=types.d.ts.map