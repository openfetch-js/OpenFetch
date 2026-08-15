import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("verb helpers send correct HTTP methods", async () => {
  await withMockFetch(jsonResponse({ ok: true }), async ({ calls }) => {
    const client = createClient({ responseType: "json", unwrapResponse: true });
    const base = "http://conf.test";

    await client.get(`${base}/g`);
    await client.post(`${base}/p`, { a: 1 });
    await client.put(`${base}/u`, { a: 2 });
    await client.patch(`${base}/pa`, { a: 3 });
    await client.delete(`${base}/d`);
    await client.head(`${base}/h`);
    await client.options(`${base}/o`);

    assert.deepEqual(
      calls.map((c) => c.method),
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    );
    assert.equal(calls[0].url, `${base}/g`);
    assert.equal(calls[1].url, `${base}/p`);
  });
});

test("request accepts string, URL, Request, and config object", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });

    await client.request("http://conf.test/str");
    await client.request(new URL("http://conf.test/url"));
    await client.request(new Request("http://conf.test/req", { method: "POST" }));
    await client.request({
      url: "http://conf.test/cfg",
      method: "PUT",
    });

    assert.equal(calls[0].url, "http://conf.test/str");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[1].url, "http://conf.test/url");
    assert.equal(calls[2].url, "http://conf.test/req");
    assert.equal(calls[2].method, "POST");
    assert.equal(calls[3].url, "http://conf.test/cfg");
    assert.equal(calls[3].method, "PUT");
  });
});

test("Request input merges with config overrides", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });
    const req = new Request("http://conf.test/from-req", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ z: 2 }),
    });
    await client.request(req, { method: "PUT" });
    assert.equal(calls[0].method, "PUT");
  });
});

test("client.use returns the same client instance", () => {
  const client = createClient();
  const mw = async (_ctx, next) => {
    await next();
  };
  const returned = client.use(mw);
  assert.equal(returned, client);
});

test("full OpenFetchResponse shape when unwrapResponse is false", async () => {
  await withMockFetch(jsonResponse({ x: 1 }), async () => {
    const client = createClient({ responseType: "json" });
    const res = await client.get("http://conf.test/shape", {
      unwrapResponse: false,
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.statusText, "string");
    assert.deepEqual(res.data, { x: 1 });
    assert.equal(typeof res.headers, "object");
    assert.ok(res.config);
  });
});
