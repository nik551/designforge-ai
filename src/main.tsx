import { StrictMode, useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, Box, Check, CircleAlert, Download, Layers3, LoaderCircle, Monitor, Plus, ScanLine, Smartphone, Sparkles, WandSparkles } from "lucide-react";
import { designSchema, review, stateNames, walk, type Design } from "../shared/design.ts";
import { demoStateEdit, demoStackEdit, examples, runDemo, starter } from "../shared/demo.ts";
import { Button } from "./ui/button";
import { Preview } from "./Preview";
import "./styles.css";

const staticDemo = import.meta.env.MODE === "pages";
const storageKey = "designforge:v1";
function restore(): Design | null {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? starter : designSchema.nullable().parse(JSON.parse(saved));
  } catch {
    return starter;
  }
}

function App() {
  const [design, setDesign] = useState(restore);
  const [prompt, setPrompt] = useState("");
  const [mobile, setMobile] = useState(false);
  const [state, setState] = useState<"default" | keyof Design["states"]>("default");
  const [mode, setMode] = useState<"demo" | "openai" | "groq" | null>(staticDemo ? "demo" : null);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState<{ message: string; text: string; current: Design | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const report = useMemo(() => design ? review(design) : null, [design]);
  const nodeCount = design ? [...walk(design.blocks)].length : 0;
  useEffect(() => {
    if (staticDemo) return;
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal }).then(res => res.json())
      .then(({ mode }) => { if (mode === "demo" || mode === "openai" || mode === "groq") setMode(mode); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(design)); } catch { /* The current tab can still be used. */ }
  }, [design]);

  async function submit(text: string, current: Design | null) {
    if (!text.trim() || busy) return;
    setPrompt(text);
    setBusy(true);
    setFailure(null);
    setFeedback("");
    try {
      let next: Design;
      if (staticDemo) {
        const candidate = runDemo({ prompt: text.trim(), current });
        if (!candidate) {
          throw new Error("Demo mode supports the examples and two edits: “Add missing states” and “Stack the layout for mobile.”");
        }
        next = designSchema.parse(candidate);
      } else {
        const response = await fetch("/api/design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, current }),
          signal: AbortSignal.timeout(80_000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Design generation failed. Try again.");
        next = designSchema.parse(result.design);
        setMode(result.mode);
      }
      setDesign(next);
      setState("default");
      setPrompt("");
      setFeedback(current ? "Changes applied. The design checks have been refreshed." : "Screen ready. Ask for a change or inspect the design checks.");
    } catch (error) {
      setFailure({ text, current, message: error instanceof Error && error.name === "Error" ? error.message : "Couldn’t generate a design. Try submitting again." });
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(prompt, design);
  }

  function reset() {
    setDesign(null);
    setState("default");
    setPrompt("");
    setFeedback("");
    setFailure(null);
  }

  function exportDesign() {
    if (!design) return;
    const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "designforge-screen"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Layers3 size={19} /></span>DesignForge <span className="brand-ai">AI</span></div>
      <div className="top-actions">
        {mode && <span className={`mode ${mode}`}><span />{mode === "groq" ? "Groq configured" : mode === "openai" ? "OpenAI configured" : "Demo mode"}</span>}
        <Button variant="ghost" onClick={reset} disabled={busy}><Plus size={16} /> New dashboard</Button>
        <Button onClick={exportDesign} disabled={!design}><Download size={15} /> Export JSON</Button>
      </div>
    </header>
    <main className="workspace">
      <section className="assistant pane" aria-labelledby="assistant-title">
        <div className="pane-bar"><Sparkles size={16} /><h1 id="assistant-title">AI Assistant</h1></div>
        <div className="assistant-body">
          <div className="assistant-intro">
            <span className="intro-icon"><WandSparkles size={23} /></span>
            <h2>{design ? "Shape your screen" : "Start a dashboard"}</h2>
            <p>{design ? "Describe what to change. DesignForge uses your current screen as context." : "Describe a single dashboard or start with an example."}</p>
          </div>
          {mode === "demo" && <p className="demo-help">Try an example, “{demoStateEdit},” or “{demoStackEdit}.”</p>}
          <div className="examples">
            <h3>Start with an example</h3>
            {examples.map(example => <button type="button" disabled={busy} key={example.title} onClick={() => void submit(example.prompt, null)}>
              <Box size={15} /><span>{example.title}</span><ArrowUp size={14} className="rotate-45" />
            </button>)}
          </div>
          <div className="messages" aria-live="polite">
            {busy && <p><LoaderCircle size={16} className="animate-spin" />Working on your screen…</p>}
            {feedback && <p><Check size={16} />{feedback}</p>}
            {failure && <><p className="error"><CircleAlert size={16} />{failure.message}</p>
              <Button className="mt-2" onClick={() => void submit(failure.text, failure.current)}>Retry request</Button></>}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="composer">
          <label className="sr-only" htmlFor="prompt">Design request</label>
          <textarea id="prompt" value={prompt} disabled={busy} maxLength={2000} onChange={event => { setPrompt(event.target.value); setFailure(null); }} placeholder={design ? "Ask for a change…" : "Describe your dashboard…"} />
          <div className="composer-footer">
            <small>{prompt.length}/2000</small>
            <Button type="submit" variant="primary" disabled={busy || !prompt.trim()}><ArrowUp size={16} />{busy ? "Working…" : design ? "Apply changes" : "Generate"}</Button>
          </div>
        </form>
      </section>

      <section className="canvas pane" aria-labelledby="canvas-title">
        <div className="pane-bar canvas-bar">
          <div className="pane-label"><Monitor size={16} /><h2 id="canvas-title">Live Preview</h2></div>
          <div className="viewport" aria-label="Preview viewport">
            <Button variant="ghost" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={15} /><span>Desktop</span></Button>
            <Button variant="ghost" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={15} /><span>Mobile</span></Button>
          </div>
        </div>
        <div className="canvas-body">
          {design ? <>
            <div className="canvas-controls">
              <span>{mobile ? "375 px · Mobile" : "Desktop canvas"}</span>
              <label>State <select value={state} onChange={event => setState(event.target.value as typeof state)}>
                <option value="default">Default</option>
                {stateNames.map(name => <option value={name} key={name}>{name[0].toUpperCase() + name.slice(1)}</option>)}
              </select></label>
            </div>
            <Preview design={design} mobile={mobile} state={state} />
          </> : <div className="empty-canvas"><Layers3 size={30} /><p>Your generated screen will appear here.</p></div>}
        </div>
      </section>

      <section className="inspector pane" aria-labelledby="inspector-title">
        <div className="pane-bar"><ScanLine size={16} /><h2 id="inspector-title">Design Inspector</h2></div>
        <div className="inspector-body">
          {report && design ? <>
            <div className="inspector-heading"><h3>Design QA</h3><span className={`badge ${report.issues.length ? "warning" : "success"}`}>{report.issues.length ? `${report.issues.length} to review` : "Passed"}</span></div>
            <div className="checks">
              <p><Check size={15} /> Valid schema</p>
              <p><Check size={15} /> {nodeCount} approved components</p>
              <p><Check size={15} /> Approved design tokens</p>
            </div>
            {report.issues.length > 0 && <>
              <ul className="issues">{report.issues.map((issue, index) => <li key={`${issue.id}-${index}`}><CircleAlert size={16} />{issue.message}</li>)}</ul>
              <Button className="w-full" disabled={busy || !mode} onClick={() => void submit(mode === "demo" ? demoStateEdit : `Fix these design QA issues and preserve unaffected content: ${report.issues.map(issue => issue.message).join(" ")}`.slice(0, 2000), design)}>
                <Sparkles size={14} /> Fix issues
              </Button>
            </>}
            <div className="tokens">
              <h3>Design tokens</h3>
              <div className="token-colors" aria-hidden="true"><i /><i /><i /><i /></div>
              <p>Forge design system</p>
            </div>
          </> : <p className="empty-inspector">Checks will run automatically when a screen is generated.</p>}
        </div>
      </section>
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
