<h1 align="center">rollout-viewer</h1>

<p align="center">
A simple local viewer for reading evaluation results and model rollouts
</p>

---

## Motivation

Evaluation and reinforcement-learning runs often produce large JSON files containing metrics, trajectories, reasoning, tool calls, rewards, and environment states.

The data is useful, but reading it directly as JSON makes it difficult to understand why a rollout succeeded or failed. This project aims to turn those files into a clear, scrollable interface for reviewing many rollouts without losing the underlying details.

## What This Repo Is About

This repository provides an Astro and React application for:

- loading evaluation summaries and trajectory files locally;
- browsing tasks and multiple rollout attempts;
- reading model responses, actions, environment states, and rewards in order;
- filtering runs by outcome and inspecting failures quickly.

## Goal

The goal is a lightweight, local-first tool that makes evaluation and RL run data pleasant to inspect while remaining easy to extend for additional rollout formats.

## Usage

Requires Node.js 22.12 or newer.

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the address printed by Astro, normally `http://localhost:4321`.

### Load a run

1. Choose or drag in a `.json`, `.jsonl`, or `.ndjson` rollout file.
2. Optionally click **Add eval JSON** and select a separate evaluation summary.
3. Select a task and rollout in the sidebar, then scroll through its turns.

All parsing happens locally in the browser. The viewer does not upload run data.

### Navigation

- Search across task IDs, rollout IDs, messages, and raw rollout data.
- Filter by the result values discovered in the loaded file.
- Click a rollout to inspect it.
- Use <kbd>j</kbd> / <kbd>↓</kbd> and <kbd>k</kbd> / <kbd>↑</kbd> to move between visible rollouts.
- Expand nested objects and arrays to inspect task-specific state.
- Expand **inspect raw turn** or **inspect raw rollout** to see the original record.

### Supported structures

The viewer detects common rollout containers named `rollouts`, `trajectories`,
`episodes`, `samples`, or `data`. Inside each rollout, it detects ordered
`steps`, `turns`, `events`, or `trajectory` arrays. Files containing one
conversation or rollout per line are parsed as JSONL.

Message objects with `role` and `content` receive readable transcript cards.
Common fields such as `prompt`, `response`, `completion`, `reasoning`, and
`observation` are also displayed as messages. Every other turn field is rendered
as generic structured data, including nested objects and arrays.

The parser uses common aliases for IDs, attempts, results, and rewards. Unknown
fields are preserved rather than discarded, so environment-specific state does
not require environment-specific UI code.

## Commands

```bash
npm run dev      # start the local development server
npm run build    # produce a static production build in dist/
npm run preview  # serve the production build locally
```
