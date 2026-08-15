import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeHttpUrl,
  cloneResponse,
  createClient,
  DEFAULT_SENSITIVE_QUERY_PARAM_NAMES,
  ensureIdempotencyKeyHeader,
  generateIdempotencyKey,
  hasIdempotencyKeyHeader,
  maskHeaderValues,
  redactSensitiveUrlQuery,
} from "../../dist/index.js";
import { withMockFetch } from "../helpers/mock-fetch.mjs";

test("assertSafeHttpUrl allows public hosts and blocks private/loopback", () => {
  assert.doesNotThrow(() => assertSafeHttpUrl("https://example.com/a"));
  assert.throws(() => assertSafeHttpUrl("http://127.0.0.1/"), /private|blocked|localhost/i);
  assert.throws(() => assertSafeHttpUrl("http://localhost/"), /localhost/i);
  assert.throws(() => assertSafeHttpUrl("http://192.168.0.1/"), /private|blocked/i);
  assert.throws(() => assertSafeHttpUrl("ftp://example.com/"), /http/);
});

test("assertSafeUrl on client rejects blocked literal IPs before fetch", async () => {
  await withMockFetch(async () => new Response("ok"), async ({ calls }) => {
    const client = createClient({ assertSafeUrl: true });
    await assert.rejects(() =>
      client.get("http://10.0.0.1/internal")
    );
    assert.equal(calls.length, 0);
  });
});

test("idempotency helpers generate, detect, and ensure header", () => {
  const key = generateIdempotencyKey();
  assert.equal(typeof key, "string");
  assert.ok(key.length > 0);

  assert.equal(hasIdempotencyKeyHeader({}), false);
  assert.equal(
    hasIdempotencyKeyHeader({ "Idempotency-Key": "abc" }),
    true
  );
  assert.equal(
    hasIdempotencyKeyHeader({ "idempotency-key": "abc" }),
    true
  );

  const headers = ensureIdempotencyKeyHeader(
    { "content-type": "application/json" },
    "k1"
  );
  assert.equal(headers["idempotency-key"], "k1");
});

test("maskHeaderValues strategies", () => {
  const input = { authorization: "Bearer secret-token", "x-ok": "plain" };
  const full = maskHeaderValues(input, {
    maskNames: ["authorization"],
    strategy: "full",
  });
  assert.notEqual(full.authorization, "Bearer secret-token");
  assert.equal(full["x-ok"], "plain");

  const partial = maskHeaderValues(input, {
    maskNames: ["authorization"],
    strategy: "partial",
    partialTailLength: 4,
  });
  assert.match(partial.authorization, /oken$/i);

  const hashed = maskHeaderValues(input, {
    maskNames: ["authorization"],
    strategy: "hash",
  });
  assert.notEqual(hashed.authorization, input.authorization);
});

test("redactSensitiveUrlQuery and DEFAULT_SENSITIVE_QUERY_PARAM_NAMES", () => {
  assert.ok(DEFAULT_SENSITIVE_QUERY_PARAM_NAMES.length > 0);
  const out = redactSensitiveUrlQuery(
    "https://api.example/x?token=secret&q=1"
  );
  assert.match(out, /token=/);
  assert.doesNotMatch(out, /secret/);
  assert.match(out, /q=1/);
});

test("cloneResponse allows multiple body reads", async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const a = cloneResponse(res);
  const b = cloneResponse(res);
  assert.deepEqual(await a.json(), { a: 1 });
  assert.deepEqual(await b.json(), { a: 1 });
});
