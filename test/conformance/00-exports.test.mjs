import { test } from "node:test";
import assert from "node:assert/strict";
import * as root from "../../dist/index.js";
import openFetchDefault from "../../dist/index.js";
import * as plugins from "../../dist/plugins/index.js";
import { createFluentClient } from "../../dist/sugar/fluent.js";

const REQUIRED_ROOT_EXPORTS = [
  "createClient",
  "create",
  "createFluentClient",
  "retry",
  "timeout",
  "hooks",
  "debug",
  "strictFetch",
  "OpenFetchError",
  "isOpenFetchError",
  "isHTTPError",
  "isTimeoutError",
  "InterceptorManager",
  "createRetryMiddleware",
  "MemoryCacheStore",
  "appendCacheKeyVaryHeaders",
  "createCacheMiddleware",
  "assertSafeHttpUrl",
  "generateIdempotencyKey",
  "hasIdempotencyKeyHeader",
  "ensureIdempotencyKeyHeader",
  "maskHeaderValues",
  "redactSensitiveUrlQuery",
  "DEFAULT_SENSITIVE_QUERY_PARAM_NAMES",
  "cloneResponse",
  "SchemaValidationError",
  "isSchemaValidationError",
  "OpenFetchForceRetry",
  "isOpenFetchForceRetry",
];

test("root package exports all public values", () => {
  for (const name of REQUIRED_ROOT_EXPORTS) {
    assert.equal(
      typeof root[name] !== "undefined",
      true,
      `missing export: ${name}`
    );
  }
});

test("default export is a usable client instance", () => {
  assert.equal(typeof openFetchDefault.request, "function");
  assert.equal(typeof openFetchDefault.get, "function");
  assert.equal(typeof openFetchDefault.use, "function");
  assert.ok(openFetchDefault.defaults);
  assert.ok(openFetchDefault.interceptors?.request);
  assert.ok(openFetchDefault.interceptors?.response);
});

test("create is an alias of createClient", () => {
  assert.equal(root.create, root.createClient);
  const a = root.createClient();
  const b = root.create();
  assert.equal(typeof a.get, "function");
  assert.equal(typeof b.get, "function");
});

test("plugins subpath exports retry/timeout/hooks/debug/strictFetch", () => {
  assert.equal(typeof plugins.retry, "function");
  assert.equal(typeof plugins.timeout, "function");
  assert.equal(typeof plugins.hooks, "function");
  assert.equal(typeof plugins.debug, "function");
  assert.equal(typeof plugins.strictFetch, "function");
  assert.equal(plugins.retry, root.retry);
  assert.equal(plugins.timeout, root.timeout);
  assert.equal(plugins.hooks, root.hooks);
  assert.equal(plugins.debug, root.debug);
  assert.equal(plugins.strictFetch, root.strictFetch);
});

test("sugar subpath exports createFluentClient", () => {
  assert.equal(typeof createFluentClient, "function");
  assert.equal(createFluentClient, root.createFluentClient);
  const fluent = createFluentClient();
  assert.equal(typeof fluent, "function");
  assert.equal(typeof fluent.get, "function");
  assert.equal(typeof fluent.use, "function");
});
