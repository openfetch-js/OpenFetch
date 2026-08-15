import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  createRetryMiddleware,
  isOpenFetchError,
  timeout,
} from "../../dist/index.js";
import { jsonResponse, statusResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

function slowFetch(ms = 500) {
  return async (_url, init) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        resolve(jsonResponse({ ok: true }));
      }, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  };
}

test("timeout option yields ERR_TIMEOUT", async () => {
  await withMockFetch(slowFetch(400), async () => {
    const client = createClient({ responseType: "json" });
    await assert.rejects(
      () =>
        client.get("http://conf.test/to", {
          timeout: 25,
          unwrapResponse: true,
        }),
      (e) => isOpenFetchError(e) && e.code === "ERR_TIMEOUT"
    );
  });
});

test("timeout plugin sets request.timeout", async () => {
  await withMockFetch(slowFetch(400), async () => {
    const client = createClient({
      middlewares: [timeout(25)],
      responseType: "json",
    });
    await assert.rejects(
      () => client.get("http://conf.test/plugin-to", { unwrapResponse: true }),
      (e) => isOpenFetchError(e) && e.code === "ERR_TIMEOUT"
    );
  });
});

test("abort during request yields ERR_CANCELED", async () => {
  await withMockFetch(slowFetch(1000), async () => {
    const client = createClient({ responseType: "json" });
    const ac = new AbortController();
    const p = client.get("http://conf.test/cancel", {
      signal: ac.signal,
      unwrapResponse: true,
    });
    setTimeout(() => ac.abort(), 20);
    await assert.rejects(
      () => p,
      (e) => isOpenFetchError(e) && e.code === "ERR_CANCELED"
    );
  });
});

test("abort stops further retries", async () => {
  let n = 0;
  await withMockFetch(async (_url, init) => {
    n += 1;
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return statusResponse(503);
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 5,
          baseDelayMs: 50,
          maxDelayMs: 50,
        }),
      ],
    });
    const ac = new AbortController();
    const p = client.get("http://conf.test/retry-cancel", {
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 30);
    await assert.rejects(
      () => p,
      (e) => isOpenFetchError(e) && e.code === "ERR_CANCELED"
    );
    assert.ok(n <= 2);
  });
});
