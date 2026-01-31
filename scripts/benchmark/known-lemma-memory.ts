#!/usr/bin/env node
/**
 * Measure memory overhead of known lemma lookup structures.
 *
 * Run with:
 *   node --expose-gc --import=tsx scripts/benchmark/known-lemma-memory.ts --candidate data-dist/lemma-is.core.bin
 *   node --expose-gc --import=tsx scripts/benchmark/known-lemma-memory.ts --candidate data-dist/lemma-is.core.bin --bloom
 */

import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { BinaryLemmatizer } from "../../src/binary-lemmatizer.js";
import { createKnownLemmaSet, createKnownLemmaFilter } from "../../src/compounds.js";

interface Args {
  candidate: string;
  bloom: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { candidate: "", bloom: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--candidate") out.candidate = args[++i];
    else if (arg === "--bloom") out.bloom = true;
  }
  if (!out.candidate) throw new Error("Missing --candidate path");
  return out;
}

function forceGC() {
  if (typeof global.gc === "function") {
    global.gc();
    global.gc();
  }
}

function getMemory() {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: mem.heapUsed / (1024 * 1024),
    heapTotalMB: mem.heapTotal / (1024 * 1024),
    arrayBuffersMB: mem.arrayBuffers / (1024 * 1024),
    rssMB: mem.rss / (1024 * 1024),
  };
}

const args = parseArgs();
const projectRoot = process.cwd();
const candidatePath = isAbsolute(args.candidate)
  ? args.candidate
  : join(projectRoot, args.candidate);

forceGC();
const beforeLoad = getMemory();

const buffer = readFileSync(candidatePath);
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

forceGC();
const afterLoad = getMemory();

const lemmas = lemmatizer.getAllLemmas();
const lookup = args.bloom
  ? createKnownLemmaFilter(lemmas, { falsePositiveRate: 0.01 })
  : createKnownLemmaSet(lemmas);

// Prevent GC
void lookup;

forceGC();
const afterLookup = getMemory();

const toMB = (v: number) => Math.round(v * 10) / 10;

const result = {
  candidate: args.candidate,
  mode: args.bloom ? "bloom" : "set",
  lemmaCount: lemmas.length,
  memoryMB: {
    baseHeapMB: toMB(afterLoad.heapUsedMB - beforeLoad.heapUsedMB),
    baseArrayBuffersMB: toMB(afterLoad.arrayBuffersMB - beforeLoad.arrayBuffersMB),
    lookupHeapMB: toMB(afterLookup.heapUsedMB - afterLoad.heapUsedMB),
    lookupArrayBuffersMB: toMB(afterLookup.arrayBuffersMB - afterLoad.arrayBuffersMB),
    lookupRssMB: toMB(afterLookup.rssMB - afterLoad.rssMB),
  },
};

console.log(JSON.stringify(result));
