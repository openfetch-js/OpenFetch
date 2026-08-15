import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  isHTTPError,
  isOpenFetchError,
  isTimeoutError,
  OpenFetchError,
} from "../../dist/index.js";
import { statusResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

test("ERR_BAD_RESPONSE and isHTTPError / isOpenFetchError", async () => {
  await withMockFetch(statusResponse(500, "fail"), async () => {
    const client = createClient();
    await assert.rejects(
      () => client.get("http://conf.test/500"),
      (e) =>
        isOpenFetchError(e) &&
        isHTTPError(e) &&
        e.code === "ERR_BAD_RESPONSE" &&
        e.response?.status === 500
    );
  });
});

test("ERR_NETWORK on fetch throw", async () => {
  await withMockFetch(async () => {
    throw new TypeError("Failed to fetch");
  }, async () => {
    const client = createClient();
    await assert.rejects(
      () => client.get("http://conf.test/net"),
      (e) => isOpenFetchError(e) && e.code === "ERR_NETWORK"
    );
  });
});

test("ERR_CANCELED when signal already aborted", async () => {
  await withMockFetch(async (_url, init) => {
    if (init.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return new Response("{}", { status: 200 });
  }, async () => {
    const client = createClient();
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      () => client.get("http://conf.test/aborted", { signal: ac.signal }),
      (e) => isOpenFetchError(e) && e.code === "ERR_CANCELED"
    );
  });
});

test("ERR_TIMEOUT and isTimeoutError", async () => {
  await withMockFetch(async (_url, init) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        resolve(new Response("{}", { status: 200 }));
      }, 500);
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
    const client = createClient({ responseType: "json" });
    await assert.rejects(
      () =>
        client.get("http://conf.test/slow", {
          timeout: 20,
          unwrapResponse: true,
        }),
      (e) =>
        e instanceof OpenFetchError &&
        e.code === "ERR_TIMEOUT" &&
        isTimeoutError(e)
    );
  });
});

test("toShape omits auth, redacts sensitive query, omits data by default", () => {
  const err = new OpenFetchError("boom", {
    code: "ERR_BAD_RESPONSE",
    config: {
      url: "https://api.example/x?token=secret&q=1",
      method: "POST",
      auth: { username: "u", password: "p" },
    },
    response: {
      data: { secret: true },
      status: 401,
      statusText: "Unauthorized",
      headers: { authorization: "Bearer x" },
      config: {},
    },
  });
  const shape = err.toShape();
  assert.equal(shape.code, "ERR_BAD_RESPONSE");
  assert.equal(shape.status, 401);
  assert.equal(shape.method, "POST");
  assert.match(shape.url, /token=%5BREDACTED%5D|token=\[REDACTED\]/);
  assert.equal(shape.data, undefined);
  assert.equal(shape.headers, undefined);
  assert.equal("auth" in shape, false);

  const withData = err.toShape({
    includeResponseData: true,
    includeResponseHeaders: true,
  });
  assert.deepEqual(withData.data, { secret: true });
  assert.ok(withData.headers);
});

test("toJSON matches toShape defaults", () => {
  const err = new OpenFetchError("x", {
    code: "ERR_NETWORK",
    config: { url: "http://conf.test/y", method: "GET" },
  });
  assert.deepEqual(err.toJSON(), err.toShape());
});
