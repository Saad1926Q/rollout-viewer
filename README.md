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
