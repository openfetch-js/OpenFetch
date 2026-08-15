import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  InterceptorManager,
} from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("InterceptorManager request runs last-registered first", async () => {
  const mgr = new InterceptorManager();
  const order = [];
  mgr.use((v) => {
    order.push("first");
    return { ...v, a: 1 };
  });
  mgr.use((v) => {
    order.push("second");
    return { ...v, b: 2 };
  });
  const out = await mgr.runRequest({ x: 0 });
  assert.deepEqual(order, ["second", "first"]);
  assert.deepEqual(out, { x: 0, b: 2, a: 1 });
});

test("InterceptorManager response runs first-registered first", async () => {
  const mgr = new InterceptorManager();
  const order = [];
  mgr.use((v) => {
    order.push("first");
    return { ...v, a: 1 };
  });
  mgr.use((v) => {
    order.push("second");
    return { ...v, b: 2 };
  });
  const out = await mgr.runResponse({ x: 0 });
  assert.deepEqual(order, ["first", "second"]);
  assert.deepEqual(out, { x: 0, a: 1, b: 2 });
});

test("eject removes interceptor by id; clear removes all", async () => {
  const mgr = new InterceptorManager();
  const order = [];
  const id0 = mgr.use(() => {
    order.push(0);
    return {};
  });
  mgr.use(() => {
    order.push(1);
    return {};
  });
  mgr.eject(id0);
  await mgr.runRequest({});
  assert.deepEqual(order, [1]);

  order.length = 0;
  mgr.clear();
  mgr.use(() => {
    order.push("after-clear");
    return {};
  });
  await mgr.runRequest({});
  assert.deepEqual(order, ["after-clear"]);
});

test("client request interceptors are LIFO and can mutate headers", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });
    const order = [];
    client.interceptors.request.use((cfg) => {
      order.push("r1");
      return {
        ...cfg,
        headers: { ...(cfg.headers ?? {}), "x-r1": "1" },
      };
    });
    client.interceptors.request.use((cfg) => {
      order.push("r2");
      return {
        ...cfg,
        headers: { ...(cfg.headers ?? {}), "x-r2": "2" },
      };
    });
    await client.get("http://conf.test/ri", { unwrapResponse: true });
    assert.deepEqual(order, ["r2", "r1"]);
    assert.equal(calls[0].headers["x-r1"], "1");
    assert.equal(calls[0].headers["x-r2"], "2");
  });
});

test("client response interceptors are FIFO and can transform data", async () => {
  await withMockFetch(jsonResponse({ n: 1 }), async () => {
    const client = createClient({ responseType: "json" });
    const order = [];
    client.interceptors.response.use((res) => {
      order.push("a");
      return { ...res, data: { ...res.data, a: true } };
    });
    client.interceptors.response.use((res) => {
      order.push("b");
      return { ...res, data: { ...res.data, b: true } };
    });
    const res = await client.get("http://conf.test/ro", {
      unwrapResponse: false,
    });
    assert.deepEqual(order, ["a", "b"]);
    assert.deepEqual(res.data, { n: 1, a: true, b: true });
  });
});

test("request interceptor reject path surfaces error", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient();
    client.interceptors.request.use(undefined, () => {
      throw new Error("req-rejected");
    });
    client.interceptors.request.use(() => {
      throw new Error("boom");
    });
    await assert.rejects(
      () => client.get("http://conf.test/rej"),
      (e) => e instanceof Error && e.message === "req-rejected"
    );
    assert.equal(calls.length, 0);
  });
});

test("response interceptor reject path can recover from prior interceptor throw", async () => {
  await withMockFetch(jsonResponse({ ok: true }), async () => {
    const client = createClient({ responseType: "json" });
    client.interceptors.response.use(() => {
      throw new Error("interceptor-boom");
    });
    client.interceptors.response.use(undefined, (err) => {
      if (err instanceof Error && err.message === "interceptor-boom") {
        return {
          data: "recovered",
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
        };
      }
      throw err;
    });
    const res = await client.get("http://conf.test/recover", {
      unwrapResponse: false,
    });
    assert.equal(res.data, "recovered");
  });
});
