#!/usr/bin/env node
/**
 * Measure lemmatization throughput using IFD gold JSONL.
 *
 * Usage:
 *   node --import=tsx scripts/benchmark/ifd-speed.ts --gold data/ifd/ifd.jsonl --candidate data-dist/lemma-is.core.bin
 */

import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { BinaryLemmatizer } from "../../src/binary-lemmatizer.js";

interface Args {
  gold: string;
  candidate: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { gold: "data/ifd/ifd.jsonl", candidate: "" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--gold") out.gold = args[++i];
    else if (arg === "--candidate") out.candidate = args[++i];
  }
  if (!out.candidate) throw new Error("Missing --candidate path");
  return out;
}

const args = parseArgs();
const projectRoot = process.cwd();
const goldPath = isAbsolute(args.gold) ? args.gold : join(projectRoot, args.gold);
const candidatePath = isAbsolute(args.candidate)
  ? args.candidate
  : join(projectRoot, args.candidate);

const buffer = readFileSync(candidatePath);
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

const lines = readFileSync(goldPath, "utf-8")
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0);

const words: string[] = [];
for (const line of lines) {
  const sent = JSON.parse(line) as { tokens: { form: string }[] };
  for (const tok of sent.tokens) {
    words.push(tok.form);
  }
}

const start = performance.now();
for (const word of words) {
  lemmatizer.lemmatize(word);
}
const elapsed = performance.now() - start;

const result = {
  candidate: args.candidate,
  tokens: words.length,
  elapsedMs: elapsed,
  wordsPerSec: words.length / (elapsed / 1000),
};

console.log(JSON.stringify(result));
