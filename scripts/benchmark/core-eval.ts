#!/usr/bin/env node
/**
 * Evaluate a candidate binary against the full baseline.
 *
 * Outputs aggregate metrics for coverage, OOV, and lemma-set overlap
 * to help pick size/accuracy cutoffs.
 *
 * Usage:
 *   node --import=tsx scripts/benchmark/core-eval.ts --candidate data-dist/lemma-is.core.bin
 */

import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { CORPUS, type TestSentence } from "./corpus.js";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
  extractIndexableLemmas,
  processText,
} from "../../src/index.js";

interface Args {
  baseline: string;
  candidate: string;
  output?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {
    baseline: "data-dist/lemma-is.bin",
    candidate: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--baseline") out.baseline = args[++i];
    else if (arg === "--candidate") out.candidate = args[++i];
    else if (arg === "--output") out.output = args[++i];
  }

  if (!out.candidate) {
    throw new Error("Missing --candidate path");
  }

  return out;
}

function loadLemmatizer(path: string): BinaryLemmatizer {
  const buffer = readFileSync(path);
  return BinaryLemmatizer.loadFromBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
}

function makeSplitter(lemmatizer: BinaryLemmatizer): CompoundSplitter {
  const knownLemmas = createKnownLemmaSet(lemmatizer.getAllLemmas());
  return new CompoundSplitter(lemmatizer, knownLemmas, {
    minPartLength: 3,
    mode: "balanced",
  });
}

function isOovToken(lemmatizer: BinaryLemmatizer, original: string): boolean {
  return !lemmatizer.isKnown(original);
}

function aggregateKey(domain: string): string {
  return domain;
}

function initAgg() {
  return {
    sentences: 0,
    wordTokens: 0,
    oovTokens: 0,
    totalCandidates: 0,
    compounds: 0,
    overlap: 0,
    baselineTotal: 0,
    candidateTotal: 0,
  };
}

function intersectSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const v of a) {
    if (b.has(v)) count++;
  }
  return count;
}

const args = parseArgs();
const projectRoot = process.cwd();
const baselinePath = isAbsolute(args.baseline)
  ? args.baseline
  : join(projectRoot, args.baseline);
const candidatePath = isAbsolute(args.candidate)
  ? args.candidate
  : join(projectRoot, args.candidate);

const baseline = loadLemmatizer(baselinePath);
const candidate = loadLemmatizer(candidatePath);

const baselineSplitter = makeSplitter(baseline);
const candidateSplitter = makeSplitter(candidate);

const baselineOptions = {
  bigrams: baseline.bigramCountValue > 0 ? baseline : undefined,
  compoundSplitter: baselineSplitter,
};
const candidateOptions = {
  bigrams: candidate.bigramCountValue > 0 ? candidate : undefined,
  compoundSplitter: candidateSplitter,
};

const totalAgg = initAgg();
const byDomain = new Map<string, ReturnType<typeof initAgg>>();

for (const sentence of CORPUS) {
  const processedBaseline = processText(sentence.text, baseline, baselineOptions);
  const processedCandidate = processText(sentence.text, candidate, candidateOptions);

  const baselineSet = extractIndexableLemmas(
    sentence.text,
    baseline,
    baselineOptions
  );
  const candidateSet = extractIndexableLemmas(
    sentence.text,
    candidate,
    candidateOptions
  );

  const overlap = intersectSize(baselineSet, candidateSet);

  const aggKey = aggregateKey(sentence.domain);
  if (!byDomain.has(aggKey)) byDomain.set(aggKey, initAgg());
  const agg = byDomain.get(aggKey)!;

  for (const token of processedCandidate) {
    if (token.kind !== "word") continue;
    totalAgg.wordTokens++;
    agg.wordTokens++;

    totalAgg.totalCandidates += token.lemmas.length;
    agg.totalCandidates += token.lemmas.length;

    if (isOovToken(candidate, token.original)) {
      totalAgg.oovTokens++;
      agg.oovTokens++;
    }

    if (token.compoundSplit?.isCompound) {
      totalAgg.compounds++;
      agg.compounds++;
    }
  }

  totalAgg.sentences++;
  agg.sentences++;

  totalAgg.overlap += overlap;
  totalAgg.baselineTotal += baselineSet.size;
  totalAgg.candidateTotal += candidateSet.size;

  agg.overlap += overlap;
  agg.baselineTotal += baselineSet.size;
  agg.candidateTotal += candidateSet.size;
}

function summarize(agg: ReturnType<typeof initAgg>) {
  const recall = agg.baselineTotal > 0 ? agg.overlap / agg.baselineTotal : 0;
  const precision = agg.candidateTotal > 0 ? agg.overlap / agg.candidateTotal : 0;
  const oovRate = agg.wordTokens > 0 ? agg.oovTokens / agg.wordTokens : 0;
  const avgCandidates =
    agg.wordTokens > 0 ? agg.totalCandidates / agg.wordTokens : 0;

  return {
    sentences: agg.sentences,
    wordTokens: agg.wordTokens,
    oovRate,
    avgCandidatesPerWord: avgCandidates,
    compoundsPerSentence: agg.sentences > 0 ? agg.compounds / agg.sentences : 0,
    lemmaOverlap: {
      recall,
      precision,
      missingRate: 1 - recall,
      extraRate: 1 - precision,
    },
  };
}

const result = {
  baseline: args.baseline,
  candidate: args.candidate,
  baselineBigrams: baseline.bigramCountValue,
  candidateBigrams: candidate.bigramCountValue,
  summary: summarize(totalAgg),
  byDomain: Object.fromEntries(
    Array.from(byDomain.entries()).map(([k, v]) => [k, summarize(v)])
  ),
};

if (args.output) {
  const fs = await import("node:fs");
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
