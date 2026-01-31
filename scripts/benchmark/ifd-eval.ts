#!/usr/bin/env node
/**
 * Evaluate lemma recall/overindexing against IFD gold corpus.
 *
 * Usage:
 *   node --import=tsx scripts/benchmark/ifd-eval.ts --gold data/ifd/ifd.jsonl --candidate data-dist/lemma-is.core.bin
 */

import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { BinaryLemmatizer } from "../../src/binary-lemmatizer.js";

type GoldToken = {
  form: string;
  lemma: string;
  pos?: string;
};

type GoldSentence = {
  docId: string;
  category?: string | null;
  sentenceIndex: number;
  tokens: GoldToken[];
};

interface Args {
  gold: string;
  candidate: string;
  output?: string;
  useSuffixFallback?: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {
    gold: "data/ifd/ifd.jsonl",
    candidate: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--gold") out.gold = args[++i];
    else if (arg === "--candidate") out.candidate = args[++i];
    else if (arg === "--output") out.output = args[++i];
    else if (arg === "--use-suffix-fallback") out.useSuffixFallback = true;
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

function initAgg() {
  return {
    sentences: 0,
    tokens: 0,
    goldFound: 0,
    oovTokens: 0,
    totalCandidates: 0,
    totalExtraCandidates: 0,
  };
}

function summarize(agg: ReturnType<typeof initAgg>) {
  const recall = agg.tokens > 0 ? agg.goldFound / agg.tokens : 0;
  const oovRate = agg.tokens > 0 ? agg.oovTokens / agg.tokens : 0;
  const avgCandidates = agg.tokens > 0 ? agg.totalCandidates / agg.tokens : 0;
  const extraRate =
    agg.totalCandidates > 0 ? agg.totalExtraCandidates / agg.totalCandidates : 0;

  return {
    sentences: agg.sentences,
    tokens: agg.tokens,
    recall,
    missingRate: 1 - recall,
    oovRate,
    avgCandidatesPerToken: avgCandidates,
    extraCandidatesPerToken:
      agg.tokens > 0 ? agg.totalExtraCandidates / agg.tokens : 0,
    extraRate,
  };
}

const args = parseArgs();
const projectRoot = process.cwd();
const goldPath = isAbsolute(args.gold) ? args.gold : join(projectRoot, args.gold);
const candidatePath = isAbsolute(args.candidate)
  ? args.candidate
  : join(projectRoot, args.candidate);

const lemmatizer = loadLemmatizer(candidatePath);

const UNKNOWN_SUFFIXES = [
  "arinnar",
  "anna",
  "unum",
  "um",
  "ir",
  "ar",
  "ur",
  "a",
  "i",
  "ið",
  "inn",
  "in",
];

const MIN_UNKNOWN_WORD_LENGTH = 6;
const MIN_STRIPPED_LENGTH = 3;
const MAX_SUFFIX_STRIPS = 2;

const isUnknownLemma = (raw: string, lemmas: string[]): boolean =>
  lemmas.length === 1 && lemmas[0] === raw.toLowerCase();

const trySuffixFallback = (raw: string): string[] | null => {
  let current = raw;
  let strippedCandidate: string | null = null;

  for (let attempt = 0; attempt < MAX_SUFFIX_STRIPS; attempt++) {
    const lower = current.toLowerCase();
    strippedCandidate = null;

    for (const suffix of UNKNOWN_SUFFIXES) {
      if (!lower.endsWith(suffix)) continue;

      const next = current.slice(0, current.length - suffix.length);
      if (next.length < MIN_STRIPPED_LENGTH) continue;

      const nextLemmas = lemmatizer.lemmatize(next);
      if (!isUnknownLemma(next, nextLemmas)) {
        return nextLemmas;
      }

      if (!strippedCandidate) {
        strippedCandidate = next;
      }
    }

    if (!strippedCandidate || strippedCandidate.length < MIN_UNKNOWN_WORD_LENGTH) {
      break;
    }

    current = strippedCandidate;
  }

  return null;
};

const getLemmas = (raw: string): string[] => {
  const lemmas = lemmatizer.lemmatize(raw);
  if (
    args.useSuffixFallback &&
    isUnknownLemma(raw, lemmas) &&
    raw.length >= MIN_UNKNOWN_WORD_LENGTH
  ) {
    const fallbackLemmas = trySuffixFallback(raw);
    if (fallbackLemmas) return fallbackLemmas;
  }
  return lemmas;
};

const content = readFileSync(goldPath, "utf-8");
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const totalAgg = initAgg();
const byCategory = new Map<string, ReturnType<typeof initAgg>>();

for (const line of lines) {
  const sentence = JSON.parse(line) as GoldSentence;
  totalAgg.sentences++;
  const category = sentence.category ?? "unknown";
  if (!byCategory.has(category)) byCategory.set(category, initAgg());
  const catAgg = byCategory.get(category)!;
  catAgg.sentences++;

  for (const token of sentence.tokens) {
    const form = token.form;
    const goldLemma = token.lemma.toLowerCase();

    const lemmas = getLemmas(form);
    const hasGold = lemmas.includes(goldLemma);

    const isKnown = (lemmatizer as { isKnown?: (w: string) => boolean }).isKnown?.(form);

    totalAgg.tokens++;
    catAgg.tokens++;
    if (hasGold) {
      totalAgg.goldFound++;
      catAgg.goldFound++;
    }
    if (isKnown === false) {
      totalAgg.oovTokens++;
      catAgg.oovTokens++;
    }

    totalAgg.totalCandidates += lemmas.length;
    catAgg.totalCandidates += lemmas.length;

    const extra = hasGold ? Math.max(0, lemmas.length - 1) : lemmas.length;
    totalAgg.totalExtraCandidates += extra;
    catAgg.totalExtraCandidates += extra;
  }
}

const result = {
  gold: args.gold,
  candidate: args.candidate,
  summary: summarize(totalAgg),
  byCategory: Object.fromEntries(
    Array.from(byCategory.entries()).map(([k, v]) => [k, summarize(v)])
  ),
};

if (args.output) {
  const fs = await import("node:fs");
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
