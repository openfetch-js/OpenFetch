import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("baseURL + relative path and params are applied", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      baseURL: "http://conf.test/api/",
      responseType: "json",
    });
    await client.get("users", {
      params: { page: 2, q: "a b" },
      unwrapResponse: true,
    });
    assert.match(calls[0].url, /^http:\/\/conf\.test\/api\/users\?/);
    assert.match(calls[0].url, /page=2/);
    assert.match(calls[0].url, /q=a(\+|%20)b/);
  });
});

test("paramsSerializer overrides default query encoding", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });
    await client.get("http://conf.test/s", {
      params: { a: 1, b: 2 },
      paramsSerializer: (p) => `custom=${p.a}-${p.b}`,
      unwrapResponse: true,
    });
    assert.equal(calls[0].url, "http://conf.test/s?custom=1-2");
  });
});

test("defaults headers merge with per-request headers", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      headers: { "x-default": "d", "x-shared": "from-default" },
      responseType: "json",
    });
    await client.get("http://conf.test/h", {
      headers: { "x-shared": "from-req", "x-extra": "e" },
      unwrapResponse: true,
    });
    assert.equal(calls[0].headers["x-default"], "d");
    assert.equal(calls[0].headers["x-shared"], "from-req");
    assert.equal(calls[0].headers["x-extra"], "e");
  });
});

test("auth sets Authorization basic header", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      auth: { username: "u", password: "p" },
      responseType: "json",
    });
    await client.get("http://conf.test/auth", { unwrapResponse: true });
    const expected = `Basic ${Buffer.from("u:p").toString("base64")}`;
    assert.equal(calls[0].headers.authorization, expected);
  });
});

test("object data is JSON-serialized with content-type", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });
    await client.post("http://conf.test/data", { hello: "world" }, {
      unwrapResponse: true,
    });
    assert.equal(calls[0].headers["content-type"], "application/json");
    assert.equal(calls[0].body, JSON.stringify({ hello: "world" }));
  });
});

test("unwrapResponse true returns data only", async () => {
  await withMockFetch(jsonResponse({ n: 9 }), async () => {
    const client = createClient({
      responseType: "json",
      unwrapResponse: true,
    });
    const data = await client.get("http://conf.test/u");
    assert.deepEqual(data, { n: 9 });
  });
});

test("withCredentials maps to credentials include", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      withCredentials: true,
      responseType: "json",
    });
    await client.get("http://conf.test/cred", { unwrapResponse: true });
    assert.equal(calls[0].init.credentials, "include");
  });
});

test("init hooks run before fetch and can mutate headers", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      responseType: "json",
      init: [
        (cfg) => {
          cfg.headers = { ...(cfg.headers ?? {}), "x-init": "1" };
        },
      ],
    });
    await client.request("http://conf.test/i", { unwrapResponse: true });
    assert.equal(calls[0].headers["x-init"], "1");
  });
});

test("transformRequest and transformResponse run in order", async () => {
  await withMockFetch(jsonResponse({ v: 1 }), async ({ calls }) => {
    const client = createClient({
      responseType: "json",
      transformRequest: [
        (data) => ({ ...data, a: 1 }),
        (data) => ({ ...data, b: 2 }),
      ],
      transformResponse: [
        (data) => ({ ...data, t1: true }),
        (data) => ({ ...data, t2: true }),
      ],
    });
    const res = await client.post(
      "http://conf.test/tr",
      { x: 0 },
      { unwrapResponse: false }
    );
    assert.equal(calls[0].body, JSON.stringify({ x: 0, a: 1, b: 2 }));
    assert.deepEqual(res.data, { v: 1, t1: true, t2: true });
  });
});
