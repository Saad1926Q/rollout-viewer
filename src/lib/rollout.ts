export type Outcome = "solved" | "illegal" | "malformed" | "truncated" | "timeout" | "unknown";

export interface Step {
  turn: number;
  board?: number[];
  legalTiles?: number[];
  response: string;
  reasoning?: string;
  action?: number | null;
  nextBoard?: number[] | null;
  status?: string;
  reward?: number;
  progressReward?: number;
  terminalReward?: number;
  finishReason?: string;
  usage?: { completionTokens?: number; promptTokens?: number; totalTokens?: number };
  raw: Record<string, unknown>;
}

export interface Rollout {
  id: string;
  rolloutId: number;
  initialBoard?: number[];
  finalBoard?: number[];
  optimalLength?: number;
  outcome: Outcome;
  reward: number;
  movesTaken: number;
  steps: Step[];
  raw: Record<string, unknown>;
}

export interface Run {
  metadata: Record<string, unknown>;
  summary: Record<string, unknown>;
  rollouts: Rollout[];
  sourceName: string;
}

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numbers(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number") ? value as number[] : undefined;
}

function outcome(value: unknown): Outcome {
  return ["solved", "illegal", "malformed", "truncated", "timeout"].includes(text(value))
    ? text(value) as Outcome
    : "unknown";
}

export function parseRolloutFile(value: unknown, sourceName: string): Run {
  const root = object(value);
  if (!Array.isArray(root.episodes)) {
    throw new Error("This does not look like a puzzle-rl trajectory file: expected a top-level episodes array.");
  }

  const rollouts = root.episodes.map((episodeValue, index) => {
    const episode = object(episodeValue);
    const steps = (Array.isArray(episode.steps) ? episode.steps : []).map((stepValue, stepIndex) => {
      const step = object(stepValue);
      const responseMetadata = object(step.response_metadata);
      const usage = object(responseMetadata.usage);
      return {
        turn: number(step.turn, stepIndex + 1),
        board: numbers(step.board),
        legalTiles: numbers(step.legal_tiles),
        response: text(step.raw_response) || text(responseMetadata.content),
        reasoning: text(responseMetadata.reasoning_content) || undefined,
        action: typeof step.tile === "number" ? step.tile : null,
        nextBoard: numbers(step.next_board) ?? null,
        status: text(step.status) || undefined,
        reward: typeof step.reward === "number" ? step.reward : undefined,
        progressReward: typeof step.progress_reward === "number" ? step.progress_reward : undefined,
        terminalReward: typeof step.terminal_reward === "number" ? step.terminal_reward : undefined,
        finishReason: text(responseMetadata.finish_reason) || undefined,
        usage: Object.keys(usage).length > 0 ? {
          completionTokens: number(usage.completion_tokens),
          promptTokens: number(usage.prompt_tokens),
          totalTokens: number(usage.total_tokens),
        } : undefined,
        raw: step,
      };
    });
    return {
      id: text(episode.id) || `episode-${index + 1}`,
      rolloutId: number(episode.rollout_id, index),
      initialBoard: numbers(episode.initial_board),
      finalBoard: numbers(episode.final_board),
      optimalLength: typeof episode.optimal_length === "number" ? episode.optimal_length : undefined,
      outcome: outcome(episode.outcome),
      reward: number(episode.reward),
      movesTaken: number(episode.moves_taken),
      steps,
      raw: episode,
    };
  });

  return { metadata: object(root.metadata), summary: object(root.summary), rollouts, sourceName };
}

export function parseSummaryFile(value: unknown): Record<string, unknown> {
  const root = object(value);
  return object(root.summary);
}

export function boardToRows(board?: number[]): number[][] {
  if (!board || board.length !== 9) return [];
  return [board.slice(0, 3), board.slice(3, 6), board.slice(6, 9)];
}

export function displayValue(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
