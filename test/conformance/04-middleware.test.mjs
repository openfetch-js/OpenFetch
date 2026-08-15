import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("middleware runs outer-to-inner then unwinds", async () => {
  await withMockFetch(jsonResponse({ ok: true }), async () => {
    const events = [];
    const outer = async (_ctx, next) => {
      events.push("outer-in");
      await next();
      events.push("outer-out");
    };
    const inner = async (_ctx, next) => {
      events.push("inner-in");
      await next();
      events.push("inner-out");
    };
    const client = createClient({
      middlewares: [outer, inner],
      responseType: "json",
      unwrapResponse: true,
    });
    await client.get("http://conf.test/mw");
    assert.deepEqual(events, [
      "outer-in",
      "inner-in",
      "inner-out",
      "outer-out",
    ]);
  });
});

test("middleware can mutate request before next", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({
      middlewares: [
        async (ctx, next) => {
          ctx.request.headers = {
            ...(ctx.request.headers ?? {}),
            "x-mw": "yes",
          };
          await next();
        },
      ],
      responseType: "json",
    });
    await client.get("http://conf.test/mut", { unwrapResponse: true });
    assert.equal(calls[0].headers["x-mw"], "yes");
  });
});

test("client.use appends middleware after defaults.middlewares", async () => {
  await withMockFetch(jsonResponse({}), async () => {
    const order = [];
    const fromConfig = async (_ctx, next) => {
      order.push("config");
      await next();
    };
    const fromUse = async (_ctx, next) => {
      order.push("use");
      await next();
    };
    const client = createClient({
      middlewares: [fromConfig],
      responseType: "json",
    });
    client.use(fromUse);
    await client.get("http://conf.test/use", { unwrapResponse: true });
    assert.deepEqual(order, ["config", "use"]);
  });
});

test("middleware sees response after next", async () => {
  await withMockFetch(jsonResponse({ v: 7 }), async () => {
    let seen;
    const client = createClient({
      middlewares: [
        async (ctx, next) => {
          await next();
          seen = ctx.response?.data;
        },
      ],
      responseType: "json",
    });
    await client.get("http://conf.test/after", { unwrapResponse: true });
    assert.deepEqual(seen, { v: 7 });
  });
});
