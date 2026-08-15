import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, OpenFetchError } from "../../dist/index.js";
import {
  jsonResponse,
  statusResponse,
  textResponse,
  withMockFetch,
} from "../helpers/mock-fetch.mjs";

test("responseType json parses body", async () => {
  await withMockFetch(jsonResponse({ a: 1 }), async () => {
    const client = createClient({ responseType: "json", unwrapResponse: true });
    const data = await client.get("http://conf.test/json");
    assert.deepEqual(data, { a: 1 });
  });
});

test("responseType text returns string", async () => {
  await withMockFetch(textResponse("hello"), async () => {
    const client = createClient({ responseType: "text", unwrapResponse: true });
    const data = await client.get("http://conf.test/text");
    assert.equal(data, "hello");
  });
});

test("responseType blob returns Blob", async () => {
  await withMockFetch(
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    }),
    async () => {
      const client = createClient({
        responseType: "blob",
        unwrapResponse: true,
      });
      const data = await client.get("http://conf.test/blob");
      assert.ok(data instanceof Blob);
      assert.equal(data.size, 3);
    }
  );
});

test("responseType arraybuffer returns ArrayBuffer", async () => {
  await withMockFetch(
    new Response(new Uint8Array([9, 8]), { status: 200 }),
    async () => {
      const client = createClient({
        responseType: "arraybuffer",
        unwrapResponse: true,
      });
      const data = await client.get("http://conf.test/ab");
      assert.ok(data instanceof ArrayBuffer);
      assert.equal(data.byteLength, 2);
    }
  );
});

test("responseType stream returns ReadableStream body", async () => {
  await withMockFetch(textResponse("stream-body"), async () => {
    const client = createClient({
      responseType: "stream",
      unwrapResponse: true,
    });
    const data = await client.get("http://conf.test/stream");
    assert.ok(data === null || typeof data.getReader === "function");
  });
});

test("rawResponse returns Response as data and skips transformResponse", async () => {
  await withMockFetch(jsonResponse({ x: 1 }), async () => {
    let transformRan = false;
    const client = createClient({
      rawResponse: true,
      transformResponse: [
        (d) => {
          transformRan = true;
          return d;
        },
      ],
    });
    const res = await client.get("http://conf.test/raw", {
      unwrapResponse: false,
    });
    assert.equal(transformRan, false);
    assert.ok(res.data instanceof Response);
    const parsed = await res.data.json();
    assert.deepEqual(parsed, { x: 1 });
  });
});

test("responseType json sets Accept when absent", async () => {
  await withMockFetch(jsonResponse({}), async ({ calls }) => {
    const client = createClient({ responseType: "json" });
    await client.get("http://conf.test/acc", { unwrapResponse: true });
    assert.equal(calls[0].headers.accept, "application/json");
  });
});

test("throwHttpErrors false does not throw on 404", async () => {
  await withMockFetch(
    statusResponse(404, '{"x":1}', {
      headers: { "content-type": "application/json" },
    }),
    async () => {
      const client = createClient({
        throwHttpErrors: false,
        responseType: "json",
      });
      const res = await client.get("http://conf.test/404", {
        unwrapResponse: false,
      });
      assert.equal(res.status, 404);
      assert.deepEqual(res.data, { x: 1 });
    }
  );
});

test("throwHttpErrors function gate", async () => {
  await withMockFetch(
    statusResponse(404, '{"x":1}', {
      headers: { "content-type": "application/json" },
    }),
    async () => {
      const client = createClient({
        throwHttpErrors: (status) => status !== 404,
        responseType: "json",
      });
      const res = await client.get("http://conf.test/404f", {
        unwrapResponse: false,
      });
      assert.equal(res.status, 404);
    }
  );
});

test("validateStatus overrides throwHttpErrors", async () => {
  await withMockFetch(statusResponse(404), async () => {
    const client = createClient({
      throwHttpErrors: () => false,
      validateStatus: () => false,
    });
    await assert.rejects(
      () => client.get("http://conf.test/vs"),
      (e) => e instanceof OpenFetchError && e.code === "ERR_BAD_RESPONSE"
    );
  });
});
