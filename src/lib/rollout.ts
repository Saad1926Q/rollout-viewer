export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Message {
  role: string;
  content: string;
  source: string;
}

export interface Turn {
  index: number;
  label: string;
  messages: Message[];
  data: JsonObject;
  raw: JsonObject;
}

export interface Rollout {
  key: string;
  id: string;
  index: number;
  status?: string;
  reward?: number;
  metrics: JsonObject;
  turns: Turn[];
  raw: JsonObject;
}

export interface RolloutGroup {
  id: string;
  label: string;
  rollouts: Rollout[];
}

export interface Run {
  format: string;
  metadata: JsonObject;
  summary: JsonObject;
  groups: RolloutGroup[];
  sourceName: string;
  warnings: string[];
}

const rolloutContainers = ["rollouts", "trajectories", "episodes", "samples", "data"];
const turnContainers = ["steps", "turns", "events", "trajectory"];
const idFields = ["id", "sample_id", "task_id", "episode_id", "prompt_id", "trajectory_id"];
const attemptFields = ["rollout_id", "trial", "attempt", "index"];
const statusFields = ["outcome", "status", "result", "state"];
const rewardFields = ["reward", "score", "return", "total_reward"];
const structuralFields = new Set([...turnContainers, "messages", ...idFields, ...attemptFields, ...statusFields, ...rewardFields]);
const messageFields: Array<[string, string]> = [
  ["system", "system"], ["prompt", "user"], ["input", "user"], ["instruction", "user"], ["user", "user"],
  ["assistant", "assistant"], ["response", "assistant"], ["completion", "assistant"], ["output", "assistant"], ["raw_response", "assistant"],
  ["reasoning", "reasoning"], ["reasoning_content", "reasoning"], ["thought", "reasoning"], ["observation", "observation"],
];

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function scalarText(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function firstField(record: JsonObject, fields: string[]): JsonValue | undefined {
  for (const field of fields) if (record[field] !== undefined) return record[field];
  return undefined;
}

function displayValue(value: JsonValue | undefined, fallback: string): string {
  return scalarText(value) || fallback;
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseMessages(record: JsonObject): Message[] {
  const messages: Message[] = [];
  if (typeof record.role === "string" && record.content !== undefined) {
    const content = scalarText(record.content) ?? JSON.stringify(record.content);
    messages.push({ role: record.role, content, source: "content" });
  }
  if (Array.isArray(record.messages)) {
    record.messages.forEach((item, index) => {
      const message = asObject(item);
      const content = scalarText(message.content) ?? scalarText(message.text) ?? scalarText(message.value);
      if (content) messages.push({ role: displayValue(message.role, `message ${index + 1}`), content, source: "messages" });
    });
  }
  for (const [field, role] of messageFields) {
    const value = record[field];
    const content = scalarText(value);
    if (content) messages.push({ role, content, source: field });
  }
  const metadata = asObject(record.response_metadata);
  const metadataContent = scalarText(metadata.content);
  if (metadataContent && !messages.some((message) => message.content === metadataContent)) {
    messages.push({ role: "assistant", content: metadataContent, source: "response_metadata.content" });
  }
  return messages;
}

function turnData(record: JsonObject): JsonObject {
  const data: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    if (structuralFields.has(key) || key === "role" || key === "content" || messageFields.some(([field]) => field === key)) continue;
    data[key] = value;
  }
  return data;
}

function extractTurns(record: JsonObject): Turn[] {
  const container = turnContainers.find((field) => Array.isArray(record[field]));
  if (container) {
    return (record[container] as JsonValue[]).map((value, index) => {
      const raw = asObject(value);
      return { index: index + 1, label: displayValue(raw.turn ?? raw.step ?? raw.index, `turn ${index + 1}`), messages: parseMessages(raw), data: turnData(raw), raw };
    });
  }
  if (Array.isArray(record.messages)) {
    return (record.messages as JsonValue[]).map((value, index) => {
      const raw = asObject(value);
      return { index: index + 1, label: `turn ${index + 1}`, messages: parseMessages(raw), data: turnData(raw), raw };
    });
  }
  return [{ index: 1, label: "turn 1", messages: parseMessages(record), data: turnData(record), raw: record }];
}

function normalizeRollout(value: JsonValue, index: number, format: string): Rollout {
  const raw = asObject(value);
  const id = displayValue(firstField(raw, idFields), `rollout ${index + 1}`);
  const attempt = displayValue(firstField(raw, attemptFields), String(index + 1));
  const status = scalarText(firstField(raw, statusFields)) || (raw.success === true ? "success" : raw.success === false ? "failure" : undefined);
  const reward = numberValue(firstField(raw, rewardFields));
  const metrics: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    if ([...idFields, ...attemptFields, ...statusFields, ...rewardFields, ...turnContainers, "messages"].includes(key)) continue;
    if (key.includes("token") || key.includes("usage") || key.includes("duration") || key.includes("time")) metrics[key] = value;
  }
  return { key: `${format}:${id}:${attempt}:${index}`, id, index: Number(attempt) || index + 1, status, reward, metrics, turns: extractTurns(raw), raw };
}

function recordsFromRoot(root: JsonValue): { records: JsonValue[]; format: string; metadata: JsonObject; summary: JsonObject } {
  if (Array.isArray(root)) return { records: root, format: "JSONL / record array", metadata: {}, summary: {} };
  const object = asObject(root);
  if (Array.isArray(object.episodes)) return { records: object.episodes, format: "episode trajectory JSON", metadata: asObject(object.metadata), summary: asObject(object.summary) };
  for (const container of rolloutContainers) {
    if (Array.isArray(object[container])) return { records: object[container] as JsonValue[], format: `${container} JSON`, metadata: asObject(object.metadata), summary: asObject(object.summary) };
  }
  if (Array.isArray(object.messages)) return { records: [object], format: "conversation JSON", metadata: asObject(object.metadata), summary: asObject(object.summary) };
  return { records: [object], format: "single rollout JSON", metadata: asObject(object.metadata), summary: asObject(object.summary) };
}

export function parseRunContent(content: string, sourceName: string): Run {
  let root: JsonValue;
  let isJsonl = false;
  try { root = JSON.parse(content) as JsonValue; }
  catch {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) throw new Error("The file is empty.");
    const records: JsonValue[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      try { records.push(JSON.parse(lines[index]) as JsonValue); }
      catch { throw new Error(`Invalid JSONL on line ${index + 1}.`); }
    }
    root = records; isJsonl = true;
  }
  const { records, format, metadata, summary } = recordsFromRoot(root);
  if (records.length === 0) throw new Error("The file contains no rollout records.");
  const rollouts = records.map((record, index) => normalizeRollout(record, index, format));
  const grouped = new Map<string, RolloutGroup>();
  rollouts.forEach((rollout) => {
    const group = grouped.get(rollout.id) ?? { id: rollout.id, label: rollout.id, rollouts: [] };
    group.rollouts.push(rollout); grouped.set(rollout.id, group);
  });
  return { format: isJsonl ? `${format}` : format, metadata, summary, groups: [...grouped.values()], sourceName, warnings: [] };
}

export function parseSummaryFile(value: unknown): JsonObject {
  const root = asObject(value);
  return asObject(root.summary) || root;
}

export function allRollouts(run: Run): Rollout[] {
  return run.groups.flatMap((group) => group.rollouts);
}

export function formatNumber(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
