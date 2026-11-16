import type { ReactNode } from "react";
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";
import type { Block, Design } from "../shared/design.ts";
import { Button } from "./ui/button";

type PreviewState = "default" | keyof Design["states"];
type Registry = { [K in Block["type"]]: (node: Extract<Block, { type: K }>) => ReactNode };

function children(nodes: Block[]) {
  return nodes.map(node => <RenderNode key={node.id} node={node} />);
}

const registry: Registry = {
  heading: node => {
    const Heading = `h${node.level}` as const;
    return <Heading className="screen-heading">{node.text}</Heading>;
  },
  paragraph: node => <p className="screen-paragraph">{node.text}</p>,
  stat: node => <div className="stat"><span>{node.label}</span><strong>{node.value}</strong>{node.note && <small>{node.note}</small>}</div>,
  card: node => <section className="screen-card" aria-label={node.title || undefined}>
    {node.title && <p className="card-title">{node.title}</p>}
    <div className={`blocks ${node.layout}`}>{children(node.children)}</div>
  </section>,
  container: node => <div className={`blocks ${node.layout}`}>{children(node.children)}</div>,
  button: node => <Button variant={node.tone}>{node.label}</Button>,
  input: node => <label className="screen-input">{node.label}<input type="text" placeholder={node.placeholder} /></label>,
  table: node => <div className="table-scroll" tabIndex={0} aria-label={node.caption || "Scrollable table"}>
    <table>
      <caption className="sr-only">{node.caption}</caption>
      <thead><tr>{node.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead>
      <tbody>{node.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => {
        const tone = { successful: "success", refunded: "neutral", pending: "warning" }[cell.toLowerCase()];
        return <td key={j}>{tone && node.columns[j].toLowerCase() === "status"
          ? <span className={`badge ${tone}`}>{cell}</span> : cell}</td>;
      })}</tr>)}</tbody>
    </table>
  </div>,
  badge: node => <span className={`badge ${node.tone}`}>{node.text}</span>,
  divider: () => <hr className="border-line" />,
};

function RenderNode({ node }: { node: Block }) {
  // The registry is exhaustive and each entry is keyed by its input discriminant.
  const render = registry[node.type] as (block: Block) => ReactNode;
  return render(node);
}

export function Preview({ design, state, mobile }: { design: Design; state: PreviewState; mobile: boolean }) {
  const StateIcon = state === "loading" ? LoaderCircle : state === "error" ? CircleAlert : Inbox;
  return <div className={`screen ${mobile ? "mobile" : ""}`}>
    <div className="screen-brand"><span className="brand-dot" />{design.name}</div>
    <div className="screen-body">
      {state === "default" ? <div className="blocks stack">{children(design.blocks)}</div> :
        <div className="state-preview">
          <StateIcon size={24} className={state === "loading" && design.states[state] ? "animate-spin" : ""} />
          <p>{design.states[state].trim() || `No ${state} state defined.`}</p>
        </div>}
    </div>
  </div>;
}
