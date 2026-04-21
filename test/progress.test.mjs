import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../dist/index.js";

test("onDownloadProgress: chunked body and Content-Length", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const parts = [encoder.encode("hel"), encoder.encode("lo")];
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          const next = parts.shift();
          if (next) controller.enqueue(next);
          else controller.close();
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "5",
        },
      }
    );
  try {
    const events = [];
    const client = createClient();
    const res = await client.request("http://progress.test/dl", {
      responseType: "text",
      unwrapResponse: false,
      onDownloadProgress: (e) => events.push({ ...e }),
    });
    assert.equal(res.data, "hello");
    assert.ok(events.length >= 1);
    const last = events.at(-1);
    assert.equal(last.transferredBytes, 5);
    assert.equal(last.totalBytes, 5);
    assert.equal(last.percent, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("onUploadProgress: string body reports bytes and percent", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const payload = "abcd";
  let received = 0;
  globalThis.fetch = async (_url, init) => {
    const body = init.body;
    assert.ok(body instanceof ReadableStream);
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const events = [];
    const client = createClient();
    await client.request("http://progress.test/ul", {
      method: "POST",
      data: payload,
      responseType: "json",
      unwrapResponse: true,
      onUploadProgress: (e) => events.push({ ...e }),
    });
    assert.equal(received, encoder.encode(payload).byteLength);
    const last = events.at(-1);
    assert.equal(last.transferredBytes, encoder.encode(payload).byteLength);
    assert.equal(last.totalBytes, encoder.encode(payload).byteLength);
    assert.equal(last.percent, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rawResponse + onDownloadProgress wraps body stream", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("x"));
          controller.close();
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "1",
        },
      }
    );
  try {
    const events = [];
    const client = createClient();
    const res = await client.request("http://progress.test/raw", {
      rawResponse: true,
      unwrapResponse: false,
      onDownloadProgress: (e) => events.push(e.transferredBytes),
    });
    const text = await res.data.text();
    assert.equal(text, "x");
    assert.ok(events.includes(1));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
