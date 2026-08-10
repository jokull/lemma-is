#!/usr/bin/env tsx
/**
 * Occurrence-data-guided review of compound splitting.
 *
 * Runs the real CompoundSplitter over every lemma of the standard (core)
 * model and flags two classes, using corpus unigram frequencies:
 *
 *   BLACKLIST candidates — words that currently split but look lexicalized:
 *     the word is much more frequent than any of its parts (it stands alone
 *     better than they do), or a part is the agent-noun suffix ari/ar.
 *     Splitting these adds index noise; they belong in the never-split list.
 *
 *   WHITELIST candidates — words that currently do NOT split but contain a
 *     frequent known lemma as a suffix. Indexing that part would add recall
 *     (a query for the part would find the word); they belong in the
 *     always-split list.
 *
 * Output is ranked lists with frequency evidence, for manual curation into
 * src/compounds.ts. The lists are a guide, not an automatic answer.
 *
 * Usage: npx tsx scripts/compound-review.mts [--limit N] [--min-freq N]
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { gzipSync, gunzipSync } from "zlib";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
  DERIVATIONAL_SUFFIX_LEMMAS,
  isStopword,
} from "../src/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const minFreqArg = args.indexOf("--min-freq");
const LIMIT = limitArg !== -1 ? Number(args[limitArg + 1]) : 60;
const MIN_FREQ = minFreqArg !== -1 ? Number(args[minFreqArg + 1]) : 30;

function load<T>(path: string): T {
  const raw = readFileSync(path);
  return JSON.parse(gunzipSync(raw).toString("utf-8"));
}

function loadLemmatizer(name: string): BinaryLemmatizer {
  const buffer = readFileSync(join(ROOT, "data-dist", name));
  return BinaryLemmatizer.loadFromBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
}

const core = loadLemmatizer("lemma-is.core.bin");
const unigrams = load<Record<string, number>>(
  join(ROOT, "data-dist", "unigrams.json.gz")
);
const lemmaSet = createKnownLemmaSet(core.getAllLemmas());
const splitter = new CompoundSplitter(core, lemmaSet);

const f = (w: string) => unigrams[w] ?? 0;

// Only review words that actually appear in the corpus (occurrence data
// exists for them); rare words are lower value for curation.
const lemmas = core
  .getAllLemmas()
  .filter((l) => l.length >= 6 && f(l) >= MIN_FREQ);

const blacklist: {
  word: string;
  freq: number;
  parts: string[];
  partFreqs: number[];
  ratio: number;
  reason: string;
}[] = [];
const whitelist: {
  word: string;
  freq: number;
  suffix: string;
  suffixFreq: number;
}[] = [];

for (const lemma of lemmas) {
  const fw = f(lemma);
  const result = splitter.split(lemma);

  if (result.isCompound) {
    const partFreqs = result.parts.map(f);
    const maxPart = Math.max(...partFreqs, 1);
    const ratio = fw / maxPart;

    // Agent-noun suffix: right part is ari/ar (kennari → kenna + ari).
    // Adverb-forming suffix: -lega/-leg (ágætlega → ágætur + lega).
    if (result.parts.some((p) => p === "ari" || p === "ar")) {
      blacklist.push({
        word: lemma,
        freq: fw,
        parts: result.parts,
        partFreqs,
        ratio,
        reason: "-ari agent noun",
      });
      continue;
    }
    if (result.parts.some((p) => p === "lega" || p === "leg")) {
      blacklist.push({
        word: lemma,
        freq: fw,
        parts: result.parts,
        partFreqs,
        ratio,
        reason: "-lega adverb",
      });
      continue;
    }
    // Lexicalized: the word outranks every part as a standalone. A high
    // ratio is suggestive but not decisive (tónlist is a real compound) —
    // the report is a guide for manual curation.
    if (fw >= 300 && ratio > 1.5) {
      blacklist.push({
        word: lemma,
        freq: fw,
        parts: result.parts,
        partFreqs,
        ratio,
        reason: "lexicalized",
      });
    }
    continue;
  }

  // Not splitting: does the word contain a frequent, content-like known
  // lemma as a suffix, with a plausible prefix (a known word form or lemma)?
  // Stopwords (inn, var, eða, ekki, ...) and lone-suffix hits (skráður →
  // "áður") flood the list and are never useful compound parts.
  for (let i = 3; i <= lemma.length - 3; i++) {
    const suffix = lemma.slice(i);
    const prefix = lemma.slice(0, i);
    if (
      f(suffix) >= 300 &&
      !isStopword(suffix) &&
      !DERIVATIONAL_SUFFIX_LEMMAS.has(suffix)
    ) {
      const prefixOk =
        core.isKnown(prefix) || lemmaSet.has(prefix);
      if (prefixOk) {
        whitelist.push({ word: lemma, freq: fw, suffix, suffixFreq: f(suffix) });
        break; // one candidate per word is enough for the report
      }
    }
  }
}

blacklist.sort((a, b) => b.ratio - a.ratio);
whitelist.sort((a, b) => b.suffixFreq - a.suffixFreq);

console.log(
  `Reviewed ${lemmas.length.toLocaleString()} corpus lemmas (freq >= ${MIN_FREQ})\n`
);

console.log(`=== BLACKLIST candidates: split but lexicalized (${blacklist.length} total) ===`);
for (const c of blacklist.slice(0, LIMIT)) {
  const parts = c.parts
    .map((p, i) => `${p}(${c.partFreqs[i].toLocaleString()})`)
    .join(" + ");
  console.log(
    `  ${c.word.padEnd(20)} f=${c.freq.toLocaleString().padStart(9)}  ${parts.padEnd(48)} ratio=${c.ratio.toFixed(1)}  [${c.reason}]`
  );
}

console.log(`\n=== WHITELIST candidates: not splitting but suffix is a common lemma (${whitelist.length} total) ===`);
for (const c of whitelist.slice(0, LIMIT)) {
  console.log(
    `  ${c.word.padEnd(22)} f=${c.freq.toLocaleString().padStart(9)}  suffix ${c.suffix} (f=${c.suffixFreq.toLocaleString()})`
  );
}
