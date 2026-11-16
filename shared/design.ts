import { z } from "zod";

const text = z.string();
const id = { id: text };
const variant = <T extends string, S extends z.ZodRawShape>(type: T, fields: S) =>
  z.strictObject({ ...id, type: z.literal(type), ...fields });

const leaf = z.union([
  variant("heading", { text, level: z.enum(["1", "2", "3"]) }),
  variant("paragraph", { text }),
  variant("stat", { label: text, value: text, note: text }),
  variant("button", { label: text, tone: z.enum(["primary", "secondary"]) }),
  variant("input", { label: text, placeholder: text }),
  variant("table", { caption: text, columns: z.array(text), rows: z.array(z.array(text)) }),
  variant("badge", { text, tone: z.enum(["neutral", "success", "warning"]) }),
  variant("divider", {}),
]);

const layout = z.enum(["stack", "grid"]);
const card = variant("card", { title: text, layout, children: z.array(leaf) });
const item = z.union([...leaf.options, card]);
const container = variant("container", { layout, children: z.array(item) });
const block = z.union([...item.options, container]);
export const stateNames = ["loading", "empty", "error"] as const;

const wireSchema = z.strictObject({
  version: z.literal(1),
  name: text,
  tokens: z.enum(["forge"]),
  states: z.strictObject({ loading: text, empty: text, error: text }),
  blocks: z.array(block),
});

const responseWire = z.strictObject({
  decision: z.enum(["dashboard", "out_of_scope"]),
  design: wireSchema.nullable(),
});

const { $schema: _draft, ...openAISchema } = z.toJSONSchema(responseWire, {
  target: "draft-7",
  override: ({ jsonSchema }) => {
    if (jsonSchema.const !== undefined) {
      jsonSchema.enum = [jsonSchema.const];
      delete jsonSchema.const;
    }
  },
});

export const outputFormat = {
  type: "json_schema",
  name: "designforge_screen",
  strict: true,
  schema: openAISchema,
};

export type Design = z.infer<typeof wireSchema>;
export type Block = z.infer<typeof block>;

export function* walk(blocks: Block[]): Generator<Block> {
  for (const node of blocks) {
    yield node;
    if ("children" in node) yield* walk(node.children);
  }
}

export const designSchema = wireSchema.superRefine((design, ctx) => {
  const nodes = [...walk(design.blocks)];
  function issue(message: string) {
    ctx.addIssue({ code: "custom", message });
  }
  if (!design.name.trim() || design.name.length > 80) issue("Screen name must contain 1–80 characters.");
  if (nodes.length < 1 || nodes.length > 45) issue("Use 1–45 components in total.");
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(node.id) || ids.has(node.id)) {
      issue("Use unique lowercase component IDs of 1–48 characters.");
    }
    ids.add(node.id);
    if (Object.values(node).some(value => typeof value === "string" && value.length > 500)) {
      issue("Component text must be 500 characters or fewer.");
    }
    if (node.type === "table") {
      const { columns, rows } = node;
      if (columns.length < 1 || columns.length > 6 || rows.length > 12 ||
          columns.some(col => !col.trim() || col.length > 60) ||
          rows.some(row => row.length !== columns.length || row.some(cell => cell.length > 120))) {
        issue("Tables need 1–6 named columns and up to 12 rows with matching cells.");
      }
    }
  }
  if (Object.values(design.states).some(value => value.length > 240)) {
    issue("State messages must be 240 characters or fewer.");
  }
  if (JSON.stringify(design).length > 32_000) issue("Keep the design under 32,000 characters.");
});

export const requestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(2000),
  current: designSchema.nullable(),
});
export type DesignRequest = z.infer<typeof requestSchema>;

export function review(input: unknown) {
  const result = designSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      id: issue.path.join(".") || "schema",
      message: issue.path[0] === "tokens"
        ? "Use the Forge token set."
        : issue.code === "invalid_union"
          ? "Unsupported component, token, or properties. Use the approved registry and its declared variants."
          : issue.message,
    }));
    return { valid: false, issues };
  }

  const { blocks, states } = result.data;
  const issues: { id: string; message: string }[] = [];
  for (const state of stateNames) {
    if (!states[state].trim()) issues.push({ id: state, message: `Add ${state === "loading" ? "a" : "an"} ${state} state message.` });
  }
  let previous = 0;
  let firstLevel = 0;
  let primaryCount = 0;
  for (const node of walk(blocks)) {
    if (node.type === "heading") {
      const level = Number(node.level);
      firstLevel ||= level;
      if (level === 1) primaryCount++;
      if (previous && level > previous + 1) issues.push({ id: node.id, message: "Avoid skipping heading levels." });
      if (!node.text.trim()) issues.push({ id: node.id, message: "Give this heading visible text." });
      previous = level;
    }
    if ((node.type === "button" || node.type === "input") && !node.label.trim()) {
      issues.push({ id: node.id, message: `Add a visible label to this ${node.type}.` });
    }
    if (node.type === "table" && !node.caption.trim()) {
      issues.push({ id: node.id, message: "Give this table an accessible caption." });
    }
  }
  if (primaryCount !== 1 || firstLevel !== 1) {
    issues.push({ id: "headings", message: "Start with one level-one heading and use it only once." });
  }
  return { valid: true, issues };
}
