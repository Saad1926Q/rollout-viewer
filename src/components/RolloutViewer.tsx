import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { allRollouts, formatNumber, parseRunContent, parseSummaryFile, type JsonObject, type JsonValue, type Message, type Rollout, type Run, type Turn } from "../lib/rollout";
import "./rollout-viewer.css";

function label(value: string) { return value.replaceAll("_", " ").replaceAll("-", " "); }
function readFile(file: File): Promise<string> { return file.text(); }

function JsonValueView({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return <code className="json-scalar">{String(value)}</code>;
  if (typeof value === "string") return <span className="json-string">{value}</span>;
  if (Array.isArray(value)) {
    const simple = value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
    if (simple && value.length <= 10) return <code className="json-array">[{value.map((item) => typeof item === "string" ? JSON.stringify(item) : String(item)).join(", ")}]</code>;
    return <details className="json-details" open={depth < 1}><summary>array · {value.length} items</summary><div className="json-nested">{value.map((item, index) => <div className="json-row" key={index}><span>{index}</span><JsonValueView value={item} depth={depth + 1} /></div>)}</div></details>;
  }
  return <details className="json-details" open={depth < 1}><summary>object · {Object.keys(value).length} fields</summary><div className="json-nested">{Object.entries(value).map(([key, item]) => <div className="json-row" key={key}><span>{key}</span><JsonValueView value={item} depth={depth + 1} /></div>)}</div></details>;
}

function DataPanel({ title, data }: { title: string; data: JsonObject }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return <section className="data-panel"><h3>{title}</h3><div>{entries.map(([key, value]) => <div className="data-row" key={key}><span>{label(key)}</span><JsonValueView value={value} /></div>)}</div></section>;
}

function MessageCard({ message }: { message: Message }) {
  return <section className={`message ${message.role.toLowerCase().replaceAll(/[^a-z0-9]/g, "-")}`}><div className="message-label">{message.role}</div><pre>{message.content}</pre></section>;
}

function TurnView({ turn }: { turn: Turn }) {
  const [rawVisible, setRawVisible] = useState(false);
  return <article className="turn"><header><span>{turn.label}</span><span>{turn.messages.length > 0 ? `${turn.messages.length} message${turn.messages.length === 1 ? "" : "s"}` : "data only"}</span></header>{turn.messages.map((message, index) => <MessageCard key={`${message.source}-${index}`} message={message} />)}<DataPanel title="turn data" data={turn.data} /><button className="raw-toggle" onClick={() => setRawVisible(!rawVisible)}>{rawVisible ? "hide raw turn" : "inspect raw turn"}</button>{rawVisible && <pre className="raw-data">{JSON.stringify(turn.raw, null, 2)}</pre>}</article>;
}

function Transcript({ rollout }: { rollout: Rollout }) {
  const [rawVisible, setRawVisible] = useState(false);
  return <main className="transcript"><div className="transcript-heading"><div><p className="eyebrow">rollout {rollout.index}</p><h1>{rollout.id}</h1><p>{rollout.turns.length} turns{rollout.status ? ` · ${label(rollout.status)}` : ""}</p></div><div className="heading-result">{rollout.status && <span className="status">{label(rollout.status)}</span>}<strong>{formatNumber(rollout.reward)}</strong><span>reward</span></div></div><DataPanel title="rollout metrics" data={rollout.metrics} />{rollout.turns.map((turn) => <TurnView key={turn.index} turn={turn} />)}<footer className="trajectory-footer"><button className="raw-toggle" onClick={() => setRawVisible(!rawVisible)}>{rawVisible ? "hide raw rollout" : "inspect raw rollout"}</button>{rawVisible && <pre className="raw-data">{JSON.stringify(rollout.raw, null, 2)}</pre>}</footer></main>;
}

function UploadCard({ onLoad, onError }: { onLoad: (file: File) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const receive = (files: FileList | null) => { const file = files?.[0]; if (!file) return; if (!/\.(json|jsonl|ndjson)$/i.test(file.name)) { onError("Choose a JSON, JSONL, or NDJSON rollout file."); return; } onLoad(file); };
  return <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}><div className="upload-mark">↥</div><h2>Open rollout data</h2><p>Load JSON, JSONL, or NDJSON. The viewer finds rollouts, turns, messages, and the remaining turn data from the file structure.</p><button onClick={() => input.current?.click()}>Choose rollout file</button><input ref={input} type="file" accept="application/json,.json,.jsonl,.ndjson" onChange={(event) => receive(event.target.files)} /><span>or drag it here</span></div>;
}

export default function RolloutViewer() {
  const [run, setRun] = useState<Run | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [summaryFile, setSummaryFile] = useState("");
  const rollouts = run ? allRollouts(run) : [];
  const statuses = useMemo(() => [...new Set(rollouts.flatMap((rollout) => rollout.status ? [rollout.status] : []))].sort(), [rollouts]);
  const filteredGroups = useMemo(() => run?.groups.map((group) => ({ ...group, rollouts: group.rollouts.filter((rollout) => (filter === "all" || rollout.status === filter) && `${rollout.id} ${JSON.stringify(rollout.raw)}`.toLowerCase().includes(query.toLowerCase())) })).filter((group) => group.rollouts.length > 0) ?? [], [run, filter, query]);
  const visible = filteredGroups.flatMap((group) => group.rollouts);
  const selected = rollouts.find((rollout) => rollout.key === selectedKey);

  const loadRollouts = async (file: File) => { try { const parsed = parseRunContent(await readFile(file), file.name); const loaded = allRollouts(parsed); setRun(parsed); setSelectedKey(loaded[0]?.key ?? ""); setSummaryFile(""); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read that rollout file."); } };
  const loadSummary = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !run) return; try { const value = JSON.parse(await readFile(file)); setRun({ ...run, summary: parseSummaryFile(value) }); setSummaryFile(file.name); setError(""); } catch { setError("Could not read that evaluation summary JSON."); } };
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return; const index = visible.findIndex((rollout) => rollout.key === selectedKey); if ((event.key === "j" || event.key === "ArrowDown") && visible[index + 1]) { event.preventDefault(); setSelectedKey(visible[index + 1].key); } if ((event.key === "k" || event.key === "ArrowUp") && visible[index - 1]) { event.preventDefault(); setSelectedKey(visible[index - 1].key); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [selectedKey, visible]);

  if (!run) return <div className="landing"><div className="landing-title"><span>rollout viewer</span><p>Read the run. Find the failure. Keep moving.</p></div><UploadCard onLoad={loadRollouts} onError={setError} />{error && <p className="error">{error}</p>}<p className="landing-note">All parsing happens locally. Unknown fields remain available as structured turn data.</p></div>;
  const rewards = rollouts.flatMap((rollout) => rollout.reward === undefined ? [] : [rollout.reward]);
  const averageReward = rewards.length > 0 ? rewards.reduce((sum, value) => sum + value, 0) / rewards.length : undefined;
  return <div className="viewer-shell"><header className="run-header"><div><p className="eyebrow">{run.format}</p><h1>{String(run.metadata.model ?? run.metadata.name ?? run.sourceName)}</h1><p>{run.groups.length} groups · {rollouts.length} rollouts{summaryFile ? ` · ${summaryFile}` : ""}</p></div><div className="run-stats"><span><b>{run.groups.length}</b> groups</span><span><b>{formatNumber(averageReward)}</b> avg reward</span><span><b>{rollouts.length}</b> rollouts</span><label className="summary-input">add eval JSON<input type="file" accept="application/json,.json" onChange={loadSummary} /></label></div></header>{error && <p className="error app-error">{error}</p>}<aside className="sidebar"><div className="sidebar-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a task or rollout" aria-label="Find a task or rollout" /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter rollouts"><option value="all">all results</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div><p className="result-count">{visible.length} of {rollouts.length} rollouts · <kbd>j</kbd> <kbd>k</kbd> to move</p><nav>{filteredGroups.map((group) => <section className="group" key={group.id}><h2>{group.label}</h2>{group.rollouts.map((rollout) => <button className={rollout.key === selectedKey ? "rollout-row selected" : "rollout-row"} onClick={() => setSelectedKey(rollout.key)} key={rollout.key}><span className="row-title">rollout {rollout.index}</span>{rollout.status && <span className="status">{label(rollout.status)}</span>}<span className="row-meta">reward {formatNumber(rollout.reward)} · {rollout.turns.length} turns</span></button>)}</section>)}</nav></aside>{selected ? <Transcript rollout={selected} /> : <main className="empty-selection">No rollout matches this filter.</main>}</div>;
}
