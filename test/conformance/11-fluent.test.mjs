import { test } from "node:test";
import assert from "node:assert/strict";
import { createFluentClient } from "../../dist/index.js";
import { jsonResponse, textResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("fluent builders set methods and callable client works", async () => {
  await withMockFetch(jsonResponse({ ok: true }), async ({ calls }) => {
    const fluent = createFluentClient({ responseType: "json" });
    await fluent("http://conf.test/call").get().json();
    await fluent("http://conf.test/p").post({ a: 1 }).json();
    await fluent("http://conf.test/u").put({ a: 2 }).json();
    await fluent("http://conf.test/pa").patch({ a: 3 }).json();
    await fluent("http://conf.test/d").delete().json();
    await fluent("http://conf.test/h").head().send();
    await fluent("http://conf.test/o").options().send();

    assert.deepEqual(
      calls.map((c) => c.method),
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    );
  });
});

test("fluent terminals: text, blob, arrayBuffer, stream, raw, send", async () => {
  await withMockFetch(textResponse("hello"), async ({ calls }) => {
    const fluent = createFluentClient();
    const t = await fluent("http://conf.test/t").text();
    assert.equal(t, "hello");

    const blob = await fluent("http://conf.test/b").blob();
    assert.ok(blob instanceof Blob);

    const ab = await fluent("http://conf.test/ab").arrayBuffer();
    assert.ok(ab instanceof ArrayBuffer);

    const stream = await fluent("http://conf.test/s").stream();
    assert.ok(stream === null || typeof stream.getReader === "function");

    const raw = await fluent("http://conf.test/r").raw();
    assert.ok(raw instanceof Response);

    const full = await fluent("http://conf.test/send").send();
    assert.equal(full.status, 200);
    assert.ok("data" in full);

    assert.equal(calls.length, 6);
  });
});

test("fluent memo shares one fetch across terminals", async () => {
  await withMockFetch(jsonResponse({ a: 1 }), async ({ calls }) => {
    const fluent = createFluentClient();
    const chain = fluent("http://conf.test/memo").memo();
    const j = await chain.json();
    const t = await chain.text();
    assert.deepEqual(j, { a: 1 });
    assert.ok(t.includes('"a"'));
    assert.equal(calls.length, 1);
  });
});

test("fluent without memo issues separate fetches per terminal", async () => {
  await withMockFetch(jsonResponse({ a: 1 }), async ({ calls }) => {
    const fluent = createFluentClient();
    const chain = fluent("http://conf.test/nomemo");
    await chain.json();
    await chain.text();
    assert.equal(calls.length, 2);
  });
});

test("fluent.use returns fluent client", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const fluent = createFluentClient();
    const returned = fluent.use(async (ctx, next) => {
      ctx.request.headers = {
        ...(ctx.request.headers ?? {}),
        "x-fluent": "1",
      };
      await next();
    });
    assert.equal(typeof returned, "function");
    await returned("http://conf.test/use").json();
    assert.equal(calls[0].headers["x-fluent"], "1");
  });
});
