import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { boardToRows, displayValue, parseRolloutFile, parseSummaryFile, type Outcome, type Rollout, type Run, type Step } from "../lib/rollout";
import "./rollout-viewer.css";

const outcomeOrder: Outcome[] = ["solved", "illegal", "malformed", "truncated", "timeout", "unknown"];

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function readFile(file: File): Promise<unknown> {
  return file.text().then((content) => JSON.parse(content));
}

function Board({ board, label }: { board?: number[]; label: string }) {
  const rows = boardToRows(board);
  if (rows.length === 0) return null;
  return <div className="board-wrap"><span className="board-label">{label}</span><div className="board">{rows.flat().map((tile, index) => <span className={tile === 0 ? "tile blank" : "tile"} key={index}>{tile === 0 ? "·" : tile}</span>)}</div></div>;
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return <span className={`outcome ${outcome}`}>{formatLabel(outcome)}</span>;
}

function UploadCard({ onLoad, onError }: { onLoad: (file: File) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) { onError("Choose a JSON trajectory file."); return; }
    onLoad(file);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files);
  };
  return <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
    <div className="upload-mark">↥</div>
    <h2>Open a trajectory run</h2>
    <p>Choose the <code>.trajectories.json</code> file written by puzzle-rl. It stays in your browser.</p>
    <button onClick={() => input.current?.click()}>Choose trajectory file</button>
    <input ref={input} type="file" accept="application/json,.json" onChange={(event) => handleFiles(event.target.files)} />
    <span>or drag it here</span>
  </div>;
}

function StepView({ step }: { step: Step }) {
  const [showRaw, setShowRaw] = useState(false);
  const content = step.reasoning || step.response;
  return <article className="turn">
    <header><span>turn {step.turn}</span>{step.status && <OutcomeBadge outcome={outcomeOrder.includes(step.status as Outcome) ? step.status as Outcome : "unknown"} />}</header>
    <Board board={step.board} label="board" />
    {step.legalTiles && <p className="legal">legal moves <strong>{step.legalTiles.join(" · ")}</strong></p>}
    {content && <section className="message assistant"><div className="message-label">assistant</div><pre>{content}</pre></section>}
    {step.action !== null && step.action !== undefined && <section className="action"><span>action</span><code>slide_tile(tile={step.action})</code></section>}
    {step.nextBoard && <Board board={step.nextBoard} label="next board" />}
    {step.reward !== undefined && <section className="rewards"><span>reward <b>{displayValue(step.reward)}</b></span><span>progress {displayValue(step.progressReward)}</span><span>terminal {displayValue(step.terminalReward)}</span></section>}
    {step.usage && <p className="usage">{displayValue(step.usage.totalTokens)} tokens · {displayValue(step.usage.completionTokens)} completion · {step.finishReason ?? "completed"}</p>}
    <button className="raw-toggle" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "hide step data" : "inspect step data"}</button>
    {showRaw && <pre className="raw-data">{JSON.stringify(step.raw, null, 2)}</pre>}
  </article>;
}

function Transcript({ rollout }: { rollout: Rollout }) {
  const [showRaw, setShowRaw] = useState(false);
  return <main className="transcript"><div className="transcript-heading"><div><p className="eyebrow">trajectory</p><h1>{rollout.id}</h1><p>rollout {rollout.rolloutId + 1} · {rollout.movesTaken} moves{rollout.optimalLength !== undefined ? ` · ${rollout.optimalLength} optimal` : ""}</p></div><div className="heading-result"><OutcomeBadge outcome={rollout.outcome} /><strong>{displayValue(rollout.reward)}</strong><span>total reward</span></div></div><Board board={rollout.initialBoard} label="initial board" />{rollout.steps.map((step) => <StepView key={step.turn} step={step} />)}<footer className="trajectory-footer"><Board board={rollout.finalBoard} label="final board" /><button className="raw-toggle" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "hide episode data" : "inspect episode data"}</button>{showRaw && <pre className="raw-data">{JSON.stringify(rollout.raw, null, 2)}</pre>}</footer></main>;
}

export default function RolloutViewer() {
  const [run, setRun] = useState<Run | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [summaryFile, setSummaryFile] = useState("");
  const selected = run?.rollouts.find((rollout) => rollout.key === selectedId);
  const filtered = useMemo(() => run?.rollouts.filter((rollout) => (filter === "all" || rollout.outcome === filter) && rollout.id.toLowerCase().includes(query.toLowerCase())) ?? [], [run, filter, query]);

  const loadTrajectory = async (file: File) => {
    try { const parsed = parseRolloutFile(await readFile(file), file.name); setRun(parsed); setSelectedId(parsed.rollouts[0]?.key ?? ""); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read that JSON file."); }
  };
  const loadSummary = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (!run) throw new Error("Open the trajectory file first."); const summary = parseSummaryFile(await readFile(file)); setRun({ ...run, summary }); setSummaryFile(file.name); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read that evaluation file."); }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!run || ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) return;
      const index = filtered.findIndex((rollout) => rollout.key === selectedId);
      if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); filtered[index + 1] && setSelectedId(filtered[index + 1].key); }
      if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); filtered[index - 1] && setSelectedId(filtered[index - 1].key); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [filtered, run, selectedId]);

  if (!run) return <div className="landing"><div className="landing-title"><span>rollout viewer</span><p>Read the run. Find the failure. Keep moving.</p></div><UploadCard onLoad={loadTrajectory} onError={setError} />{error && <p className="error">{error}</p>}<p className="landing-note">Supports puzzle-rl <code>*.trajectories.json</code>. More formats can be added as adapters.</p></div>;
  const summary = run.summary;
  return <div className="viewer-shell"><header className="run-header"><div><p className="eyebrow">local run viewer</p><h1>{String(run.metadata.model ?? "Untitled evaluation")}</h1><p>{run.sourceName}{summaryFile ? ` + ${summaryFile}` : ""}</p></div><div className="run-stats"><span><b>{displayValue(typeof summary.solved_rate === "number" ? summary.solved_rate * 100 : undefined)}%</b> solved</span><span><b>{displayValue(summary.mean_reward as number)}</b> avg reward</span><span><b>{displayValue(summary.num_episodes as number ?? run.rollouts.length)}</b> episodes</span><label className="summary-input">add eval JSON<input type="file" accept="application/json,.json" onChange={loadSummary} /></label></div></header>{error && <p className="error app-error">{error}</p>}<aside className="sidebar"><div className="sidebar-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an episode" aria-label="Find an episode" /><select value={filter} onChange={(event) => setFilter(event.target.value as Outcome | "all")} aria-label="Filter rollouts"><option value="all">all outcomes</option>{outcomeOrder.filter((item) => item !== "unknown").map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}</select></div><p className="result-count">{filtered.length} of {run.rollouts.length} rollouts · <kbd>j</kbd> <kbd>k</kbd> to move</p><nav>{filtered.map((rollout) => <button className={rollout.key === selectedId ? "rollout-row selected" : "rollout-row"} onClick={() => setSelectedId(rollout.key)} key={rollout.key}><span className="row-title">{rollout.id.split(":").at(-1)} <small>rollout {rollout.rolloutId + 1}</small></span><OutcomeBadge outcome={rollout.outcome} /><span className="row-meta">reward {displayValue(rollout.reward)} · {rollout.movesTaken} moves</span></button>)}</nav></aside>{selected ? <Transcript rollout={selected} /> : <main className="empty-selection">No rollout matches this filter.</main>}</div>;
}
