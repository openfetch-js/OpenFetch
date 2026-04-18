import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  createRetryMiddleware,
  OpenFetchForceRetry,
} from "../dist/index.js";

test("debug basic: only request, response, error stages", async () => {
  const originalFetch = globalThis.fetch;
  const stages = [];
  globalThis.fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const client = createClient({
      debug: "basic",
      logger: (e) => stages.push(e.stage),
    });
    await client.request("http://example.test/x", { unwrapResponse: true });
    assert.ok(stages.includes("request"));
    assert.ok(stages.includes("response"));
    assert.ok(!stages.includes("config"));
    assert.ok(!stages.includes("fetch"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("debug verbose: lifecycle includes config, fetch, parse, schema", async () => {
  const originalFetch = globalThis.fetch;
  const stages = [];
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ a: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const client = createClient({
      debug: true,
      logger: (e) => stages.push(e.stage),
      headers: { Authorization: "Bearer secret-token" },
      jsonSchema: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (v) => ({ value: v }),
        },
      },
    });
    await client.request("http://example.test/data?token=abc", {
      unwrapResponse: true,
    });
    assert.ok(stages.includes("config"));
    assert.ok(stages.includes("init"));
    assert.ok(stages.includes("request"));
    assert.ok(stages.includes("fetch"));
    assert.ok(stages.includes("fetch_complete"));
    assert.ok(stages.includes("parse"));
    assert.ok(stages.includes("schema"));
    assert.ok(stages.includes("response"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("debug verbose + retry: attempt_start, retry, hook_after_response on force retry", async () => {
  const originalFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const events = [];
    const client = createClient({
      debug: "verbose",
      logger: (e) => events.push({ stage: e.stage, ...e }),
      middlewares: [
        createRetryMiddleware({
          maxAttempts: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          onAfterResponse: () => {
            if (n === 1) throw new OpenFetchForceRetry();
          },
        }),
      ],
      unwrapResponse: true,
    });
    await client.request("http://example.test/r");
    assert.equal(n, 2);
    const stages = events.map((x) => x.stage);
    assert.ok(stages.filter((s) => s === "attempt_start").length >= 2);
    assert.ok(stages.includes("hook_after_response"));
    assert.ok(stages.includes("retry"));
    const retryEv = events.find((e) => e.stage === "retry");
    assert.equal(retryEv.reason, "forceRetry");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("debug fetch logs redacted URL and masked authorization", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    let fetchPayload = null;
    const client = createClient({
      debug: "verbose",
      logger: (e) => {
        if (e.stage === "fetch") fetchPayload = e;
      },
      headers: { Authorization: "Bearer verysecret" },
    });
    await client.request("http://example.test/z?password=1");
    assert.ok(fetchPayload);
    assert.match(fetchPayload.url, /password=\[REDACTED\]|password=%5BREDACTED%5D/);
    const auth = fetchPayload.headers?.authorization ?? "";
    assert.ok(!auth.includes("verysecret"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
