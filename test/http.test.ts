import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../server/app.ts";
import { examples } from "../shared/demo.ts";

test("HTTP demo supports generation, editing, validation, and request throttling", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) => fetch(`${base}/api/design`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await health.json(), { ok: true, mode: "demo" });
    const response = await post({ current: null, prompt: examples[0].prompt });
    assert.equal(response.status, 200);
    const { design } = await response.json();
    const edit = await post({ current: design, prompt: "Add missing states" });
    assert.equal(edit.status, 200);
    assert.ok((await edit.json()).design.states.empty);
    assert.equal((await post({ current: null, prompt: "" })).status, 400);
    assert.equal((await post({ current: null, prompt: "Unrecognized demo prompt" })).status, 422);
    assert.equal((await post({ current: null, prompt: "x".repeat(90_000) })).status, 413);
    assert.equal((await post({ current: design, prompt: "Add missing states and turn this into a mobile game" })).status, 422);
    for (let i = 0; i < 2; i++) assert.equal((await post({})).status, 400);
    assert.equal((await post({ current: null, prompt: examples[0].prompt })).status, 429);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
