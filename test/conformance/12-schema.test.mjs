import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  createFluentClient,
  isSchemaValidationError,
  SchemaValidationError,
} from "../../dist/index.js";
import { jsonResponse, withMockFetch } from "../helpers/mock-fetch.mjs";

function testSchema(issues) {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value) {
        if (issues.length === 0) {
          return { value };
        }
        return { issues };
      },
    },
  };
}

test("jsonSchema success returns validated data", async () => {
  await withMockFetch(jsonResponse({ a: 1 }), async () => {
    const client = createClient({ responseType: "json" });
    const data = await client.get("http://conf.test/ok", {
      jsonSchema: testSchema([]),
      unwrapResponse: true,
    });
    assert.deepEqual(data, { a: 1 });
  });
});

test("jsonSchema failure throws SchemaValidationError", async () => {
  await withMockFetch(jsonResponse({ a: 1 }), async () => {
    const client = createClient({ responseType: "json" });
    await assert.rejects(
      () =>
        client.get("http://conf.test/bad", {
          jsonSchema: testSchema([{ message: "nope" }]),
          unwrapResponse: true,
        }),
      (e) =>
        e instanceof SchemaValidationError &&
        isSchemaValidationError(e) &&
        Array.isArray(e.issues)
    );
  });
});

test("fluent .json(schema) validates", async () => {
  await withMockFetch(jsonResponse({ k: 1 }), async () => {
    const fluent = createFluentClient();
    await assert.rejects(
      () =>
        fluent("http://conf.test/f").json(testSchema([{ message: "bad" }])),
      (e) => e instanceof SchemaValidationError
    );
    const ok = await fluent("http://conf.test/f2").json(testSchema([]));
    assert.deepEqual(ok, { k: 1 });
  });
});
