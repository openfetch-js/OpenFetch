# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## About OpenFetch

**OpenFetch** (`@hamdymohamedak/openfetch`) is a small, **dependency-free** HTTP client for any JavaScript runtime that provides the standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API (Node 18+, Bun, Deno, Cloudflare Workers, browsers). It focuses on a single transport layer, **no legacy browser-only globals** (`window`, `document`, `localStorage`), so it stays **SSR- and React Server Component–friendly**.

**Core surface:** default export and `createClient()` / `create()` instances with `baseURL`, query `params`, `headers`, `timeout`, `signal`, body helpers, `responseType`, `validateStatus`, request/response **interceptors**, and async **middleware** wrapping the fetch adapter.

**Built-in capabilities:** `OpenFetchError` with structured shapes, **`createRetryMiddleware()`** (backoff, total/per-attempt timeouts, idempotency key helpers for retried POSTs), **`MemoryCacheStore`** and **`createCacheMiddleware()`** (TTL, optional stale-while-revalidate).

**Optional entry points (tree-shaking):**

- `@hamdymohamedak/openfetch/plugins` — `retry()`, `timeout()`, `hooks()`, `debug()` (e.g. masked headers in logs), `strictFetch()`.
- `@hamdymohamedak/openfetch/sugar` — **`createFluentClient()`**: URL + method chaining (`.get()`, `.post()`, …), terminals like `.json()`, `.text()`, `.send()`, **`.raw()`** (native `Response` without adapter body parsing on that path), and **`.memo()`** (one HTTP round-trip; body buffered once for multiple terminals—not HTTP cache).

For a feature matrix, examples, and execution order (middleware vs retry vs interceptors), see the [README](https://github.com/openfetch-js/OpenFetch/blob/main/README.md).

---

## [Unreleased]

### Changed

- **Examples** — `examples/` is library usage samples (`quick-start`, interceptors, plugins, fluent, cache, errors, RSC). The Claude skill plugin template moved to [`skills/claude-skill`](./skills/claude-skill).
- **`OpenFetchError.toShape()` / `toJSON()`** — Response **`data`** and **`headers`** are omitted unless you pass `includeResponseData: true` / `includeResponseHeaders: true`.
- **`createCacheMiddleware`** — Cache keys **always** fold `authorization` and `cookie` unless `varyHeaderNames` is explicitly `[]`. Extra `varyHeaderNames` entries are merged with those two. The one-time `console.warn` now applies only when `varyHeaderNames: []` is explicit with auth/cookie and no custom `key`.

### Added

- **`assertSafeUrl`** on `OpenFetchConfig` — When true, runs `assertSafeHttpUrl` on the fully resolved URL before `fetch` (e.g. `createClient({ assertSafeUrl: true })`).

## [0.2.8] - 2026-04-14

### Added

- **`rawResponse` / fluent `.raw()`** — Returns the native `fetch` `Response` as `data` without reading the body in the adapter; skips `transformRequest`/`parseBody`/`transformResponse` on that path. Client response interceptors still run (`data` is the `Response`). Documented in types and README.
- **`createFluentClient()`** (`@hamdymohamedak/openfetch/sugar`) — Callable URL + method chaining (`.get()`, `.post()`, …); terminal methods (`.json()`, `.text()`, `.send()`, `.raw()`, …) each start a request unless **`.memo()`** is used.
- **`.memo()`** — Request-level memoization: one HTTP round-trip; body buffered once as `ArrayBuffer`; subsequent terminals reuse it (not HTTP caching).
- **Subpath exports** — `package.json` `exports`: `"./plugins"` and `"./sugar"` for tree-shaking.
- **Plugins** (`@hamdymohamedak/openfetch/plugins`) — `retry()`, `timeout()`, `hooks()`, `debug()`, `strictFetch()` wrapping `createRetryMiddleware` and related behavior.
- **Retry middleware** — `retry.timeoutTotalMs` with monotonic timing (`performance.now()` when available); `enforceTotalTimeout` merges deadline into `signal` per attempt; `retry.timeoutPerAttemptMs` overrides per-attempt `timeout`; external `signal` abort stops the loop and short-circuits backoff; `retry.autoIdempotencyKey` / stable **`Idempotency-Key`** for POST when retrying non-idempotent methods; `clearTimeout` in `dispatch` `finally` for per-attempt timers.
- **Helpers** — `generateIdempotencyKey`, `hasIdempotencyKeyHeader`, `ensureIdempotencyKeyHeader`; **`maskHeaderValues`** with strategies **`full`**, **`partial`** (e.g. `Bearer ****abcd`), **`hash`** (short fingerprint); **`cloneResponse`** for multiple body reads.
- **Debug plugin** — `maskStrategy`, `maskPartialTailLength` (tail-only implies `partial`); optional masked request headers in logs.
- **Example** — `examples/plugins-fluent.example.ts`.
- **Tests** — `npm test`: Node built-in runner; masking, `cloneResponse`, fluent memo, middleware order vs retry, hooks placement, abort during backoff / pre-start, retry with `timeoutPerAttemptMs`.
- **Security tests** — Expanded `security-tests/run.mjs` coverage.
- **Documentation** — README: execution model (middleware order, retry loop, terminals, `rawResponse` semantics), fluent/memo/debug/masking notes; **SECURITY.md** updates.

### Changed

- **`dispatch`** — `rawResponse` early return path; timeout cleanup in `finally`.
- **`OpenFetchRetryOptions` / types** — Extended retry and `rawResponse` documentation.

### Notes

- **`ERR_CANCELED`** from a per-attempt timeout is not retried (same as user abort).
- Published package **`files`** include `CHANGELOG.md` from this release onward.
