#!/usr/bin/env node
/**
 * Warm performance benchmark for lemma-is (JavaScript)
 *
 * After warmup iterations, measures throughput and latency percentiles.
 * Outputs JSON to stdout.
 *
 * Run with:
 *   node --expose-gc --import=tsx scripts/benchmark/warm-js.ts
 *   bun scripts/benchmark/warm-js.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS } from "./corpus.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// Configuration
const WARMUP_ITERATIONS = 100;
const MEASUREMENT_ITERATIONS = 1000;

// Load lemmatizer
const dataPath =
  process.env.LEMMA_IS_DATA ??
  join(projectRoot, "data-dist", "lemma-is.bin");
const buffer = readFileSync(dataPath);
const { BinaryLemmatizer } = await import("../../src/binary-lemmatizer.js");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

// Prepare word list
const allText = CORPUS.map(s => s.text).join(" ");
const words = allText
  .split(/\s+/)
  .map(w => w.replace(/[.,!?;:""„"]/g, "").toLowerCase())
  .filter(w => w.length > 0);

const totalWords = words.length;

// Warmup phase
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
  for (const word of words) {
    lemmatizer.lemmatize(word);
  }
}

// Force GC if available
if (typeof global.gc === "function") {
  global.gc();
}

// Measurement phase - record individual word latencies
const latencies: number[] = [];
const measurementStart = performance.now();

for (let i = 0; i < MEASUREMENT_ITERATIONS; i++) {
  for (const word of words) {
    const start = performance.now();
    lemmatizer.lemmatize(word);
    latencies.push(performance.now() - start);
  }
}

const measurementTimeMs = performance.now() - measurementStart;
const totalWordsProcessed = totalWords * MEASUREMENT_ITERATIONS;

// Calculate statistics
latencies.sort((a, b) => a - b);
const n = latencies.length;

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const sum = latencies.reduce((a, b) => a + b, 0);
const mean = sum / n;
const variance = latencies.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
const stdDev = Math.sqrt(variance);

// Output
const runtime = typeof Bun !== "undefined"
  ? `Bun ${Bun.version}`
  : `Node ${process.version}`;

const result = {
  runtime,
  warmupIterations: WARMUP_ITERATIONS,
  measurementIterations: MEASUREMENT_ITERATIONS,
  wordsPerIteration: totalWords,
  totalWordsProcessed,
  measurementTimeMs,
  throughputWordsPerSec: totalWordsProcessed / (measurementTimeMs / 1000),
  latencyMsPerWord: {
    mean,
    stdDev,
    min: latencies[0],
    max: latencies[n - 1],
  },
  latencyP50Ms: percentile(latencies, 50),
  latencyP95Ms: percentile(latencies, 95),
  latencyP99Ms: percentile(latencies, 99),
};

console.log(JSON.stringify(result));
