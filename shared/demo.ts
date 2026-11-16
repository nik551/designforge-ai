import type { Block, Design, DesignRequest } from "./design.ts";

export const demoStateEdit = "Add missing states";
export const demoStackEdit = "Stack the layout for mobile";

export const examples = [
  { title: "Merchant payments", prompt: "Create a merchant dashboard with payments, refunds, settlements and recent transactions." },
  { title: "Support inbox", prompt: "Create a customer support dashboard with open tickets and a search field." },
  { title: "Inventory overview", prompt: "Create an inventory overview with stock levels and a low-stock notice." },
];

export const starter: Design = {
  version: 1,
  name: "Payments overview",
  tokens: "forge",
  states: { loading: "Loading payment activity…", empty: "", error: "" },
  blocks: [
    { id: "title", type: "heading", text: "Payments overview", level: "1" },
    { id: "intro", type: "paragraph", text: "Monitor your payments, refunds, and settlements across all channels.", },
    { id: "metrics", type: "container", layout: "grid", children: [
      { id: "payments", type: "stat", label: "Total collected", value: "₹8,45,200", note: "↑ 12.5% vs last month" },
      { id: "refunds", type: "stat", label: "Refunds", value: "₹24,180", note: "8 refunds this month" },
      { id: "settlements", type: "stat", label: "Settled", value: "₹6,20,000", note: "Next payout tomorrow" },
    ] },
    { id: "transactions", type: "card", title: "Recent transactions", layout: "stack", children: [
      { id: "transaction-table", type: "table", caption: "Recent payment activity", columns: ["Transaction", "Customer", "Amount", "Status"], rows: [
        ["TXN-1024", "Ananya Rao", "₹2,499", "Successful"],
        ["TXN-1023", "Karan Shah", "₹1,200", "Refunded"],
        ["TXN-1022", "Meera Nair", "₹4,800", "Pending"],
        ["TXN-1021", "Dev Patel", "₹3,250", "Successful"],
      ] },
    ] },
  ],
};

const presets = [
  starter,
  sample("Support inbox", "Track incoming requests and follow up with customers.", ["24", "7", "3"], ["Open tickets", "Waiting for reply", "Urgent"], ["Ticket", "Subject", "Status"], [["SUP-82", "Billing question", "Open"], ["SUP-81", "Account access", "Pending"]]),
  sample("Inventory overview", "Monitor available stock and upcoming replenishment.", ["128", "12", "4"], ["Active products", "Low stock", "Inbound orders"], ["SKU", "Product", "Available"], [["INV-181", "Canvas tote", "8"], ["INV-180", "Steel bottle", "29"]]),
];

function sample(name: string, intro: string, values: string[], labels: string[], columns: string[], rows: string[][]): Design {
  return {
    ...starter,
    name,
    states: { loading: "Loading records…", empty: "", error: "" },
    blocks: [
      { id: "title", type: "heading", level: "1", text: name },
      { id: "intro", type: "paragraph", text: intro },
      { id: "metrics", type: "container", layout: "grid", children: labels.map((label, index) => ({
        id: `stat-${index}`, type: "stat", label, value: values[index], note: "",
      })) },
      { id: "records", type: "card", title: "Recent records", layout: "stack", children: [
        { id: "search", type: "input", label: "Search records", placeholder: "Search by name or ID" },
        { id: "records-table", type: "table", caption: "Recent records", columns, rows },
      ] },
    ],
  };
}

export function runDemo({ current, prompt }: DesignRequest): Design | null {
  const normalized = prompt.toLowerCase();
  if (!current) {
    const index = examples.findIndex(example => example.prompt.toLowerCase() === normalized);
    return presets[index] ?? null;
  }

  const commands = normalized.replace(/[.!]+$/, "").split(" and ");
  if (!commands.every(command => [demoStateEdit.toLowerCase(), demoStackEdit.toLowerCase()].includes(command))) return null;

  const states = { ...current.states };
  let blocks = current.blocks;
  if (commands.includes(demoStateEdit.toLowerCase())) {
    const messages = { loading: "Loading records…", empty: "There are no records to show yet.", error: "We couldn’t load your records. Try again." };
    for (const key of Object.keys(states) as (keyof typeof states)[]) {
      states[key] ||= messages[key];
    }
  }
  if (commands.includes(demoStackEdit.toLowerCase())) {
    const stack = <T extends Block>(node: T): T => "layout" in node
      ? { ...node, layout: "stack", children: node.children.map(stack) }
      : node;
    blocks = blocks.map(stack);
  }
  return { ...current, states, blocks };
}
