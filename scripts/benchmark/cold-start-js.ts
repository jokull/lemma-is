#!/usr/bin/env node
/**
 * Cold start benchmark for lemma-is (JavaScript)
 *
 * Measures import time, data load time, and first call latency
 * in a fresh process. Outputs JSON to stdout.
 *
 * Run with:
 *   node --expose-gc --import=tsx scripts/benchmark/cold-start-js.ts
 *   bun scripts/benchmark/cold-start-js.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// Phase 1: Measure import time
const importStart = performance.now();
const { BinaryLemmatizer } = await import("../../src/binary-lemmatizer.js");
const importTimeMs = performance.now() - importStart;

// Phase 2: Measure data load time
const dataLoadStart = performance.now();
const dataPath =
  process.env.LEMMA_IS_DATA ??
  join(projectRoot, "data-dist", "lemma-is.bin");
const buffer = readFileSync(dataPath);
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
const dataLoadTimeMs = performance.now() - dataLoadStart;

// Phase 3: Measure first call latency
const testWord = "húsnæðislánasjóður";
const firstCallStart = performance.now();
lemmatizer.lemmatize(testWord);
const firstCallTimeMs = performance.now() - firstCallStart;

// Output
const runtime = typeof Bun !== "undefined"
  ? `Bun ${Bun.version}`
  : `Node ${process.version}`;

const result = {
  runtime,
  importTimeMs,
  dataLoadTimeMs,
  firstCallTimeMs,
  totalColdStartMs: importTimeMs + dataLoadTimeMs + firstCallTimeMs,
};

console.log(JSON.stringify(result));
