import assert from "node:assert/strict";
import test from "node:test";
import { designSchema, requestSchema, review } from "../shared/design.ts";
import { examples, runDemo, starter } from "../shared/demo.ts";
import { generate, GenerationError } from "../server/generate.ts";

test("all demo prompts produce valid designs and are editable", () => {
  for (const example of examples) {
    const current = designSchema.parse(runDemo({ prompt: example.prompt, current: null }));
    assert.deepEqual(review(current).issues.map(issue => issue.id), ["empty", "error"]);
    const edited = designSchema.parse(runDemo({ prompt: "Add missing states and stack the layout for mobile", current }));
    assert.equal(edited.name, current.name);
    assert.deepEqual(review(edited), { valid: true, issues: [] });
    assert.ok(edited.blocks.every(node => !("layout" in node) || node.layout === "stack"));
    assert.deepEqual(edited.blocks[0], current.blocks[0]);
    assert.equal(current.states.empty, "");
  }
});

test("invalid component, custom token, extra props, duplicate ID, and malformed table fail validation", () => {
  const invalid = [
    { ...starter, blocks: [{ id: "unsafe", type: "html", value: "<script>" }] },
    { ...starter, tokens: "custom" },
    { ...starter, blocks: [{ ...starter.blocks[0], html: "<img>" }] },
    { ...starter, blocks: [starter.blocks[0], starter.blocks[0]] },
    { ...starter, blocks: [{ id: "table", type: "table", caption: "Data", columns: ["A"], rows: [["1", "2"]] }] },
  ];
  for (const candidate of invalid) assert.equal(review(candidate).valid, false);
  assert.equal(requestSchema.safeParse({ current: null, prompt: " " }).success, false);
  assert.equal(requestSchema.safeParse({ current: null, prompt: "a".repeat(2001) }).success, false);
  assert.equal(runDemo({ current: null, prompt: "Build anything" }), null);
});

test("QA reports skipped headings and missing labels deterministically", () => {
  const report = review({
    ...starter,
    blocks: [
      { id: "title", type: "heading", level: "1", text: "Title" },
      { id: "skip", type: "heading", level: "3", text: "Skipped a level" },
      { id: "input", type: "input", label: "", placeholder: "A placeholder" },
      { id: "submit", type: "button", label: "", tone: "primary" },
      { id: "table", type: "table", caption: "", columns: ["A"], rows: [] },
    ],
  });
  assert.equal(report.valid, true);
  assert.deepEqual(report.issues.map(issue => issue.id), ["empty", "error", "skip", "input", "submit", "table"]);
});

const config = { key: "test-key", model: "test-model" };
const request = { prompt: "Add a refund metric", current: starter };
function providerResponse(content: object) {
  return Response.json({ status: "completed", output: [{ content: [content] }] });
}
function output(value: unknown) {
  return providerResponse({ type: "output_text", text: JSON.stringify(value) });
}

test("structured generation sends the existing design and retries invalid output once", async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-key");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    const input = JSON.parse(body.input);
    assert.deepEqual(input.current, starter);
    assert.equal(input.validationFeedback.length > 0, calls === 2);
    return output({ decision: "dashboard", design: calls === 1 ? { ...starter, blocks: [] } : starter });
  };
  assert.deepEqual(await generate(request, config, transport), starter);
  assert.equal(calls, 2);
});

test("refusals stop immediately and invalid outputs exhaust the retry budget", async () => {
  let calls = 0;
  await assert.rejects(generate(request, config, async () => {
    calls++;
    return providerResponse({ type: "refusal" });
  }), (error: unknown) => error instanceof GenerationError && error.status === 422);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(generate(request, config, async () => {
    calls++;
    return output({});
  }), (error: unknown) => error instanceof GenerationError && error.status === 502);
  assert.equal(calls, 2);
});

test("out-of-scope requests stop without design or repair", async () => {
  let calls = 0;
  await assert.rejects(generate({ ...request, prompt: "Turn this into a mobile game" }, config, async () => {
    calls++;
    return output({ decision: "out_of_scope", design: null });
  }), (error: unknown) => error instanceof GenerationError && error.status === 422 && /dashboard prototype/.test(error.message));
  assert.equal(calls, 1);
});

test("a dashboard response needs a stat or table; a rejection must have no design", async () => {
  let calls = 0;
  await assert.rejects(generate(request, config, async () => {
    calls++;
    return calls === 1
      ? output({ decision: "dashboard", design: { ...starter, blocks: [starter.blocks[0]] } })
      : output({ decision: "out_of_scope", design: starter });
  }), (error: unknown) => error instanceof GenerationError && error.status === 502);
  assert.equal(calls, 2);
});

test("Groq sends strict JSON Schema and parses a validated dashboard", async () => {
  const design = await generate(request, { ...config, provider: "groq", model: "openai/gpt-oss-20b" }, async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(JSON.parse(body.messages[1].content).current, starter);
    return Response.json({ choices: [{
      finish_reason: "stop",
      message: { content: JSON.stringify({ decision: "dashboard", design: starter }) },
    }] });
  });
  assert.deepEqual(design, starter);
});
