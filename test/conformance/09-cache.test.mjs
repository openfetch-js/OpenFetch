import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendCacheKeyVaryHeaders,
  createCacheMiddleware,
  createClient,
  MemoryCacheStore,
} from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("appendCacheKeyVaryHeaders folds header values into key", () => {
  const key = appendCacheKeyVaryHeaders("GET http://x", { Authorization: "Bearer a" }, [
    "authorization",
  ]);
  assert.match(key, /authorization:Bearer a/);
  assert.equal(
    appendCacheKeyVaryHeaders("base", {}, []),
    "base"
  );
});

test("MemoryCacheStore evicts oldest when maxEntries exceeded", () => {
  const store = new MemoryCacheStore({ maxEntries: 2 });
  const entry = (n) => ({
    response: {
      data: n,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    },
    freshUntil: Date.now() + 60_000,
    expireAt: Date.now() + 60_000,
  });
  store.set("a", entry(1));
  store.set("b", entry(2));
  store.set("c", entry(3));
  assert.equal(store.get("a"), undefined);
  assert.ok(store.get("b"));
  assert.ok(store.get("c"));
  store.delete("b");
  assert.equal(store.get("b"), undefined);
  store.clear();
  assert.equal(store.get("c"), undefined);
});

test("cache hit avoids second fetch", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    return jsonResponse({ n });
  }, async () => {
    const store = new MemoryCacheStore({ maxEntries: 10 });
    const client = createClient({
      middlewares: [createCacheMiddleware(store, { ttlMs: 60_000 })],
      responseType: "json",
      unwrapResponse: true,
    });
    const a = await client.get("http://conf.test/cached");
    const b = await client.get("http://conf.test/cached");
    assert.deepEqual(a, { n: 1 });
    assert.deepEqual(b, { n: 1 });
    assert.equal(n, 1);
  });
});

test("memoryCache.skip bypasses cache", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    return jsonResponse({ n });
  }, async () => {
    const store = new MemoryCacheStore({ maxEntries: 10 });
    const client = createClient({
      middlewares: [createCacheMiddleware(store, { ttlMs: 60_000 })],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.get("http://conf.test/skip");
    await client.get("http://conf.test/skip", {
      memoryCache: { skip: true },
    });
    assert.equal(n, 2);
  });
});

test("varyHeaderNames separates cache by Authorization", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    return jsonResponse({ n });
  }, async () => {
    const store = new MemoryCacheStore({ maxEntries: 10 });
    const client = createClient({
      middlewares: [
        createCacheMiddleware(store, {
          ttlMs: 60_000,
          varyHeaderNames: ["authorization"],
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    const a = await client.get("http://conf.test/vary", {
      headers: { Authorization: "Bearer a" },
    });
    const b = await client.get("http://conf.test/vary", {
      headers: { Authorization: "Bearer b" },
    });
    const a2 = await client.get("http://conf.test/vary", {
      headers: { Authorization: "Bearer a" },
    });
    assert.deepEqual(a, { n: 1 });
    assert.deepEqual(b, { n: 2 });
    assert.deepEqual(a2, { n: 1 });
    assert.equal(n, 2);
  });
});

test("stale-while-revalidate serves stale then refreshes", async () => {
  let n = 0;
  await withMockFetch(async () => {
    n += 1;
    return jsonResponse({ n });
  }, async () => {
    const store = new MemoryCacheStore({ maxEntries: 10 });
    const client = createClient({
      middlewares: [
        createCacheMiddleware(store, {
          ttlMs: 20,
          staleWhileRevalidateMs: 5_000,
        }),
      ],
      responseType: "json",
      unwrapResponse: true,
    });
    const first = await client.get("http://conf.test/swr");
    assert.deepEqual(first, { n: 1 });
    await new Promise((r) => setTimeout(r, 35));
    const stale = await client.get("http://conf.test/swr");
    assert.deepEqual(stale, { n: 1 });
    await new Promise((r) => setTimeout(r, 40));
    const refreshed = await client.get("http://conf.test/swr");
    assert.ok(refreshed.n >= 1);
    assert.ok(n >= 2);
  });
});
