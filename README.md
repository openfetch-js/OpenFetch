<p align="center">
  <img
    src="https://cdn.jsdelivr.net/npm/@hamdymohamedak/openfetch@latest/docs/openfetch-logo.jpg"
    alt="openFetch official logo"
    width="400"
  />
</p>

# @hamdymohamedak/openfetch

A small, dependency-free HTTP client for JavaScript runtimes that expose the standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API. It supports instances with defaults, request and response interceptors, HTTP verb helpers, optional request/response transforms, composable middleware, retries, structured debug logging, optional JSON validation ([Standard Schema](https://github.com/standard-schema/standard-schema)), and in-memory caching—without legacy browser-only globals.

**What you get**

- **ESM-only** — use `import` / `import type`; there is no CommonJS build. **1.x** follows [semantic versioning](https://semver.org/).
- One transport: `fetch` only (Node 18+, Bun, Deno, Cloudflare Workers, browsers).
- No polyfills required for supported environments.
- Safe for server rendering and React Server Components: no `window`, `document`, `localStorage`, or framework coupling.

## Installation

```bash
npm install @hamdymohamedak/openfetch
# or pin the stable major line:
npm install @hamdymohamedak/openfetch@^1
```

## Quick start

```ts
import openFetch, { createClient } from "@hamdymohamedak/openfetch";

const { data, status, headers } = await openFetch.get(
  "https://api.example.com/v1/users"
);

const api = createClient({
  baseURL: "https://api.example.com",
  headers: { Authorization: "Bearer <token>" },
  timeout: 10_000,
  unwrapResponse: true,
});

const users = await api.get("/v1/users");
```

## Features

| Area | Details |
|------|---------|
| Instances | `createClient()` / `create()` with mutable `defaults` |
| HTTP verbs | `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options` |
| Config | `baseURL`, `params`, `headers`, `timeout`, `signal`, `data` / `body`, `auth`, `responseType`, `rawResponse`, `validateStatus`, `throwHttpErrors`, `jsonSchema` (Standard Schema), `init` hooks, `debug` / `logger` (pipeline events), `assertSafeUrl`, `unwrapResponse`, plus `RequestInit` fields (`credentials`, `redirect`, …) |
| Interceptors | Request and response stacks (documented call order) |
| Middleware | Async `use()` hooks wrapping the fetch adapter |
| Errors | `OpenFetchError` with `toShape()` / `toJSON()`; `SchemaValidationError` when `jsonSchema` fails |
| Retry | `createRetryMiddleware()` — backoff, `timeoutTotalMs` / `timeoutPerAttemptMs`, idempotent POST key; `OpenFetchForceRetry` from `hooks({ onAfterResponse })` to force another attempt |
| Cache | `MemoryCacheStore` + `createCacheMiddleware()` (TTL, optional stale-while-revalidate) |
| Plugins | `retry({ attempts, … })`, `timeout(ms)`, `hooks({ onBeforeRetry, onAfterResponse, … })`, `debug({ maskStrategy: 'partial' \| 'hash', … })`, `strictFetch()` |
| Fluent API | `createFluentClient()` — lazy chain; **each** `.json()` / `.json(schema)` / `.raw()` / … runs **one** request unless you use `.memo()`; `.raw()` → `Response` |

Subpath imports (tree-shaking): `@hamdymohamedak/openfetch/plugins`, `@hamdymohamedak/openfetch/sugar`.

```ts
import { createFluentClient, retry, timeout } from "@hamdymohamedak/openfetch";

const client = createFluentClient({ baseURL: "https://api.example.com" })
  .use(retry({ attempts: 3 }))
  .use(timeout(5000));

const data = await client("/v1/user").json<{ id: string }>();

// Native Response (unread body); second terminal = second HTTP call
const res = await client("/v1/export").get().raw();
const blob = await res.blob();

// One HTTP round-trip, then parse as JSON and as text (body buffered once — not HTTP caching)
const memoed = client("/v1/profile").get().memo();
const profile = await memoed.json();
const rawText = await memoed.text();
```

Register **`retry` before `timeout`** so retries wrap the full inner stack. Use **interceptors** to mutate config/response; use **`hooks`** for side-effect logging around the middleware pipeline.

**Fluent:** `.get()` / `.post()` only build config. **Each terminal** (`.json()`, `.text()`, `.send()`, `.raw()`, …) triggers a **new** `fetch` unless the chain used **`.memo()`** (request-level memoization: one `fetch`, body read once into memory). For two reads of the same native `Response`, use **`cloneResponse(res)`** from the package exports (or `.clone()` on the `Response`).

**`rawResponse` / `.raw()`:** the adapter does **not** read the body and skips **`transformResponse`**. Client **response interceptors** still run (`data` is the native `Response`). Middleware that expects parsed `ctx.response.data` will not see transforms until you parse yourself.

**Retry timing:** `retry.timeoutTotalMs` measures elapsed time with a monotonic clock (`performance.now()` when available), so the budget is not skewed by system clock changes. By default (`retry.enforceTotalTimeout !== false`), each attempt merges a deadline into the request `signal` so an in-flight `fetch` aborts when the budget runs out (`ERR_RETRY_TIMEOUT`). Set `retry.enforceTotalTimeout: false` to enforce the budget only between attempts. `retry.timeoutPerAttemptMs` sets `timeout` for every attempt inside the retry middleware. Each `dispatch` uses `clearTimeout` in a `finally` block so per-attempt timers are not left dangling.

**Debug:** Default logs omit request headers. Logged URLs **redact common sensitive query parameters** (`token`, `code`, `password`, …); set `maskUrlQuery: false` to log raw URLs (avoid in production). Use `debug({ includeRequestHeaders: true, maskHeaders: ["authorization"], maskStrategy: "partial" })` for values like `Bearer ****abcd`, or `maskStrategy: "hash"` for a short fingerprint. **`maskHeaderValues`** supports the same strategies when building your own logs.

### Execution model

Understanding order helps avoid surprises with retries, timeouts, and escape hatches.

1. **Request interceptors** run on the merged config (mutations apply to the in-flight request).
2. **Middleware stack** runs in registration order: the **first** `use()` is the **outer** shell; its `next()` enters the next middleware, and the **last** middleware’s `next()` runs the built-in handler that calls **`dispatch`** (`fetch` + parse, unless `rawResponse`).
3. **Inside `dispatch`:** `transformRequest` → `fetch` → (optional body parse) → **`transformResponse`** (skipped when `rawResponse`).
4. **Response interceptors** run on the `OpenFetchResponse` (for `rawResponse`, `data` is still a native `Response`).
5. **Retry** (`createRetryMiddleware` / `retry()`): each retry calls `next()` again, so middleware **below** retry in the stack runs **once per attempt**; middleware **above** retry wraps the whole loop (one outer enter/exit per logical request).
6. **Terminal methods** (fluent `.json()`, `.text()`, client `.get()`, …) each start a **new** pipeline invocation unless you used **`.memo()`** on that chain.

**Backoff:** between retries, the retry middleware sleeps with jitter; if the request **`signal`** aborts during that wait, the loop stops (`ERR_CANCELED`).

### Memory cache and authentication

The default cache key is ``METHOD fullUrl``. The first request with **`Authorization` or `Cookie`** and no `varyHeaderNames` / custom `key` triggers a **one-time `console.warn`** (suppress with `suppressAuthCacheKeyWarning: true` if you only cache public data). For **authenticated or per-user** GETs, also pass header names that affect the response so entries do not leak across users:

```ts
createCacheMiddleware(store, {
  ttlMs: 60_000,
  varyHeaderNames: ["authorization", "cookie"],
});
```

Or build a custom `key` and use `appendCacheKeyVaryHeaders` from the package exports. See [SECURITY.md](https://github.com/openfetch-js/OpenFetch/blob/main/SECURITY.md).

### Retries and POST/PUT

By default, retries after network failures or retryable HTTP statuses run only for **GET**, **HEAD**, **OPTIONS**, and **TRACE**. To retry mutating methods, set `retry: { retryNonIdempotentMethods: true }` (per client or per request).

When `retryNonIdempotentMethods` is true and `maxAttempts > 1`, **POST** requests automatically receive a stable **`Idempotency-Key`** header (if you did not set one) so retries share the same key (Stripe-style deduplication). Opt out with `retry: { autoIdempotencyKey: false }`. You can still set `Idempotency-Key` / `idempotency-key` yourself; it will be respected.

If the request `signal` is aborted (`AbortController.abort()`), the retry middleware stops: no more `fetch` attempts, and backoff ends early when a signal is linked.

For low-level access without consuming the body in openFetch, set `rawResponse: true` on a request or use fluent `.raw()`.

### Optional URL guard (server-side)

For URLs influenced by untrusted input, either call `assertSafeHttpUrl(url)` before requesting or enable **`assertSafeUrl: true`** on the client (defaults or per request). That blocks literal private/loopback IPs for `http:`/`https:` on the fully resolved URL; it does not fix DNS rebinding — see [SECURITY.md](https://github.com/openfetch-js/OpenFetch/blob/main/SECURITY.md).

### Errors and logging

`OpenFetchError.toShape()` / `toJSON()` omit `config.auth` and, **by default**, omit response **`data`** and **`headers`**; pass `includeResponseData: true` / `includeResponseHeaders: true` when you need them for trusted diagnostics. By default the serialized `url` **redacts common sensitive query parameters**; pass `redactSensitiveUrlQuery: false` only in trusted environments. The error instance itself can still hold full `config`; do not expose it raw.

## Documentation

- **Guide (VitePress):** [openfetch-js.github.io/openfetch-docs/](https://openfetch-js.github.io/openfetch-docs/)
- **Changelog:** [CHANGELOG.md](https://github.com/openfetch-js/OpenFetch/blob/main/CHANGELOG.md)
- **Security:** [SECURITY.md](https://github.com/openfetch-js/OpenFetch/blob/main/SECURITY.md)
- **Claude Code:** `claude plugin marketplace add openfetch-js/OpenFetch`, then `claude plugin install openfetch@openfetch-js`. Published skill plugin: [openFetchSkill — README](https://github.com/openfetch-js/openFetchSkill/blob/main/README.md).
- **Skill folder template (this monorepo):** [examples/claude-skill](https://github.com/openfetch-js/OpenFetch/tree/main/examples/claude-skill) — layout reference; see [examples/README.md](https://github.com/openfetch-js/OpenFetch/blob/main/examples/README.md).
- **Contributing:** [CONTRIBUTING.md](https://github.com/openfetch-js/OpenFetch/blob/main/CONTRIBUTING.md)

## Requirements

- Node.js **18** or newer (or any runtime with `fetch` and `AbortController`).

## License

MIT
