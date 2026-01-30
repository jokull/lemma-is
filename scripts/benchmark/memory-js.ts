#!/usr/bin/env node
/**
 * Memory measurement for lemma-is (JavaScript)
 *
 * Uses process.memoryUsage() for comprehensive measurement.
 * ArrayBuffers are tracked via arrayBuffers, not heap.
 * Run with --expose-gc flag for accurate results.
 *
 * Run with:
 *   node --expose-gc --import=tsx scripts/benchmark/memory-js.ts
 *   bun scripts/benchmark/memory-js.ts
 */

import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// Force GC if available
function forceGC() {
  if (typeof global.gc === "function") {
    global.gc();
    global.gc(); // Run twice for more thorough cleanup
  }
}

// Get memory stats
function getMemory() {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: mem.heapUsed / (1024 * 1024),
    heapTotalMB: mem.heapTotal / (1024 * 1024),
    arrayBuffersMB: mem.arrayBuffers / (1024 * 1024),
    rssMB: mem.rss / (1024 * 1024),
  };
}

// Measure before loading
forceGC();
const before = getMemory();

// Load lemmatizer
const dataPath =
  process.env.LEMMA_IS_DATA ??
  join(projectRoot, "data-dist", "lemma-is.bin");
const dataFileSizeBytes = statSync(dataPath).size;
const buffer = readFileSync(dataPath);
const { BinaryLemmatizer } = await import("../../src/binary-lemmatizer.js");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

// Measure after loading
forceGC();
const after = getMemory();

// Calculate deltas
const dataFileSizeMB = dataFileSizeBytes / (1024 * 1024);
const heapDeltaMB = after.heapUsedMB - before.heapUsedMB;
const arrayBuffersDeltaMB = after.arrayBuffersMB - before.arrayBuffersMB;
const rssDeltaMB = after.rssMB - before.rssMB;

// Total memory = heap + array buffers
const totalMemoryMB = heapDeltaMB + arrayBuffersDeltaMB;

// Output
const runtime = typeof Bun !== "undefined"
  ? `Bun ${Bun.version}`
  : `Node ${process.version}`;

const result = {
  runtime,
  heapMB: Math.round(totalMemoryMB * 10) / 10, // heap + ArrayBuffers (comparable metric)
  rssMB: Math.round(rssDeltaMB * 10) / 10,
  dataFileSizeMB: Math.round(dataFileSizeMB * 10) / 10,
  expansionFactor: Math.round((totalMemoryMB / dataFileSizeMB) * 100) / 100,
  breakdown: {
    jsHeapDeltaMB: Math.round(heapDeltaMB * 10) / 10,
    arrayBuffersDeltaMB: Math.round(arrayBuffersDeltaMB * 10) / 10,
  },
  raw: {
    before,
    after,
  },
};

console.log(JSON.stringify(result));
