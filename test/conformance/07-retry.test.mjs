import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  createRetryMiddleware,
  OpenFetchForceRetry,
} from "../../dist/index.js";
import { jsonResponse, statusResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("GET retries on 503 by default", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    if (n === 1) return statusResponse(503);
    return jsonResponse({ ok: true });
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 2,
          maxDelayMs: 10,
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    const data = await client.get("http://conf.test/503");
    assert.deepEqual(data, { ok: true });
    assert.equal(n, 2);
  });
});

test("POST does not retry by default", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    return statusResponse(503);
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 2,
          maxDelayMs: 10,
        }),
      ],
    });
    await assert.rejects(() =>
      client.post("http://conf.test/post-503", { a: 1 })
    );
    assert.equal(n, 1);
  });
});

test("POST retries with retryNonIdempotentMethods and auto Idempotency-Key", async () => {
  let n = 0;
  /** @type {string[]} */
  const keys = [];
  await withMockFetch(async (_url, _init, call) => {
    n += 1;
    keys.push(call.headers["idempotency-key"]);
    if (n === 1) return statusResponse(503);
    return jsonResponse({ ok: true });
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 2,
          maxDelayMs: 10,
          retryNonIdempotentMethods: true,
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.post("http://conf.test/post-retry", { a: 1 });
    assert.equal(n, 2);
    assert.ok(keys[0]);
    assert.equal(keys[0], keys[1]);
  });
});

test("preserves existing Idempotency-Key; autoIdempotencyKey false skips", async () => {
  /** @type {string[]} */
  const keys = [];
  await withMockFetch(async (_url, _init, call) => {
    keys.push(call.headers["idempotency-key"]);
    return statusResponse(503);
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 2,
          baseDelayMs: 2,
          maxDelayMs: 10,
          retryNonIdempotentMethods: true,
        }),
      ],
    });
    await assert.rejects(() =>
      client.post(
        "http://conf.test/idem-preserve",
        {},
        { headers: { "Idempotency-Key": "fixed-key" } }
      )
    );
    assert.equal(keys[0], "fixed-key");
    assert.equal(keys[1], "fixed-key");
  });

  keys.length = 0;
  await withMockFetch(async (_url, _init, call) => {
    keys.push(call.headers["idempotency-key"]);
    return statusResponse(503);
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 2,
          baseDelayMs: 2,
          maxDelayMs: 10,
          retryNonIdempotentMethods: true,
          autoIdempotencyKey: false,
        }),
      ],
    });
    await assert.rejects(() =>
      client.post("http://conf.test/idem-off", {})
    );
    assert.equal(keys[0], undefined);
  });
});
test("OpenFetchForceRetry triggers another attempt", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    if (n === 1) return jsonResponse({});
    return jsonResponse({ ok: true });
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 2,
          maxDelayMs: 10,
          onAfterResponse: async (_ctx, res) => {
            if (
              n === 1 &&
              res.data &&
              typeof res.data === "object" &&
              !("ok" in res.data)
            ) {
              throw new OpenFetchForceRetry();
            }
          },
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    const data = await client.get("http://conf.test/force");
    assert.deepEqual(data, { ok: true });
    assert.equal(n, 2);
  });
});

test("shouldRetry can deny retries; onBeforeRetry is called", async () => {
  let n = 0;
  const before = [];
  await withMockFetch(async () => {
    n += 1;
    return statusResponse(503);
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 5,
          baseDelayMs: 2,
          maxDelayMs: 10,
          shouldRetry: () => false,
          onBeforeRetry: async () => {
            before.push(1);
          },
        }),
      ],
    });
    await assert.rejects(() => client.get("http://conf.test/deny"));
    assert.equal(n, 1);
    assert.deepEqual(before, []);
  });

  n = 0;
  before.length = 0;
  await withMockFetch(async () => {
    n += 1;
    if (n === 1) return statusResponse(503);
    return jsonResponse({});
  }, async () => {
    const client = createClient({
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 2,
          maxDelayMs: 10,
          onBeforeRetry: async () => {
            before.push("r");
          },
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.get("http://conf.test/before");
    assert.deepEqual(before, ["r"]);
  });
});
