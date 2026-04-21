import { test } from "node:test";
import assert from "node:assert/strict";
import { Agent } from "undici";
import { createClient } from "../dist/index.js";

test("dispatcher is passed through to fetch (Undici Agent)", async () => {
  const originalFetch = globalThis.fetch;
  let seenDispatcher;
  globalThis.fetch = async (_url, init) => {
    seenDispatcher = init.dispatcher;
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const agent = new Agent({ allowH2: true });
  try {
    const client = createClient();
    await client.request("http://undici.test/d", {
      dispatcher: agent,
      responseType: "json",
      unwrapResponse: true,
    });
    assert.strictEqual(seenDispatcher, agent);
  } finally {
    globalThis.fetch = originalFetch;
    await agent.close();
  }
});

test("allowH2: true passes a dispatcher from undici Agent", async () => {
  const originalFetch = globalThis.fetch;
  let dispatcherConstructor;
  globalThis.fetch = async (_url, init) => {
    dispatcherConstructor = init.dispatcher?.constructor?.name;
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = createClient();
    await client.request("http://undici.test/h2", {
      allowH2: true,
      responseType: "json",
      unwrapResponse: true,
    });
    assert.equal(dispatcherConstructor, "Agent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dispatcher wins over allowH2 (only custom dispatcher used)", async () => {
  const originalFetch = globalThis.fetch;
  const custom = new Agent({ allowH2: false });
  let used;
  globalThis.fetch = async (_url, init) => {
    used = init.dispatcher;
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = createClient();
    await client.request("http://undici.test/priority", {
      dispatcher: custom,
      allowH2: true,
      responseType: "json",
      unwrapResponse: true,
    });
    assert.strictEqual(used, custom);
  } finally {
    globalThis.fetch = originalFetch;
    await custom.close();
  }
});
