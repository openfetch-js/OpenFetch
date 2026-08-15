import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  debug,
  hooks,
  retry,
  strictFetch,
  timeout,
} from "../../dist/index.js";
import * as plugins from "../../dist/plugins/index.js";
import { jsonResponse, statusResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("retry plugin retries GET on 503 (attempts alias)", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    if (n === 1) return statusResponse(503);
    return jsonResponse({ ok: true });
  }, async () => {
    const client = createClient({
      middlewares: [
        retry({ attempts: 3, baseDelayMs: 2, maxDelayMs: 10 }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    const data = await client.get("http://conf.test/retry-plugin");
    assert.deepEqual(data, { ok: true });
    assert.equal(n, 2);
  });
});

test("timeout plugin from subpath matches root", async () => {
  assert.equal(plugins.timeout, timeout);
  await withMockFetch(async (_url, init) => {
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(jsonResponse({})), 400);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }, async () => {
    const client = createClient({
      middlewares: [plugins.timeout(20)],
      responseType: "json",
    });
    await assert.rejects(() =>
      client.get("http://conf.test/to-sub", { unwrapResponse: true })
    );
  });
});

test("hooks plugin fires onRequest and onResponse", async () => {
  const events = [];
  await withMockFetch(jsonResponse({}), async () => {
    const client = createClient({
      middlewares: [
        hooks({
          onRequest: () => {
            events.push("req");
          },
          onResponse: () => {
            events.push("res");
          },
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.get("http://conf.test/hooks");
    assert.deepEqual(events, ["req", "res"]);
  });
});

test("debug plugin emits log phases when enabled", async () => {
  /** @type {string[]} */
  const phases = [];
  await withMockFetch(jsonResponse({}), async () => {
    const client = createClient({
      middlewares: [
        debug({
          enabled: true,
          log: (phase) => {
            phases.push(phase);
          },
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.get("http://conf.test/debug");
    assert.ok(phases.length > 0);
  });
});

test("strictFetch sets redirect error when unset", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      middlewares: [strictFetch()],
      responseType: "json",
    });
    await client.get("http://conf.test/strict", { unwrapResponse: true });
    assert.equal(calls[0].init.redirect, "error");
  });
});

test("strictFetch does not override explicit redirect", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      middlewares: [strictFetch()],
      responseType: "json",
    });
    await client.get("http://conf.test/strict2", {
      redirect: "follow",
      unwrapResponse: true,
    });
    assert.equal(calls[0].init.redirect, "follow");
  });
});
