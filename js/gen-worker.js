/*
 * gen-worker.js — builds a puzzle off the main thread.
 *
 * A thin wrapper and nothing else: engine.js posts { id, spec }, this calls
 * the same buildPuzzle the main thread would, and posts back { id, puzzle }
 * or { id, error }. Because the generator is a pure function of the seed
 * string, a puzzle built here is identical to one built on the main thread
 * (engine.js falls back to that when module workers are unavailable).
 *
 * Loaded as a module worker: new Worker(url, { type: 'module' }).
 */

import { buildPuzzle } from "./engine.js";

self.onmessage = (e) => {
  const { id, spec } = e.data || {};
  try {
    self.postMessage({ id, puzzle: buildPuzzle(spec) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
