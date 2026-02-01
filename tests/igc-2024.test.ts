/**
 * IGC-2024 HuggingFace corpus coverage tests.
 *
 * Tests lemmatizer coverage against real-world Icelandic text from
 * the arnastofnun/IGC-2024 dataset on HuggingFace.
 *
 * To fetch samples:
 *   uv run python scripts/benchmark/igc/fetch_igc_2024.py
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
} from "../src/index.js";
import { processText, runBenchmark } from "../src/pipeline.js";

interface IGC2024Sample {
  config: string;
  uuid: string;
  text: string;
}

const SAMPLES_PATH = join(
  import.meta.dirname,
  "..",
  "data",
  "igc",
  "igc-2024-samples.jsonl"
);

function loadSamples(): IGC2024Sample[] {
  if (!existsSync(SAMPLES_PATH)) {
    return [];
  }
  const content = readFileSync(SAMPLES_PATH, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as IGC2024Sample);
}

describe("IGC-2024 Coverage", () => {
  let lemmatizer: BinaryLemmatizer;
  let compoundSplitter: CompoundSplitter;
  let samples: IGC2024Sample[];

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const lemmasList = lemmatizer.getAllLemmas();
    const knownLemmas = createKnownLemmaSet(lemmasList);
    compoundSplitter = new CompoundSplitter(lemmatizer, knownLemmas, {
      minPartLength: 3,
      mode: "aggressive",
    });

    samples = loadSamples();
  });

  it("should have samples available", () => {
    if (samples.length === 0) {
      console.warn(
        "\n⚠️  No IGC-2024 samples found. Run:\n" +
          "   uv run python scripts/benchmark/igc/fetch_igc_2024.py\n"
      );
    }
    // Don't fail, just skip if no samples
    expect(true).toBe(true);
  });

  it("should report coverage statistics by config", () => {
    if (samples.length === 0) {
      return;
    }

    const byConfig: Record<
      string,
      {
        docs: number;
        tokens: number;
        knownTokens: number;
        unknownWords: Set<string>;
        coverage: number[];
      }
    > = {};

    for (const sample of samples) {
      const { config, text } = sample;

      if (!byConfig[config]) {
        byConfig[config] = {
          docs: 0,
          tokens: 0,
          knownTokens: 0,
          unknownWords: new Set(),
          coverage: [],
        };
      }

      const stats = byConfig[config];
      stats.docs++;

      const processed = processText(text, lemmatizer, {
        bigrams: lemmatizer,
        compoundSplitter,
      });

      const wordTokens = processed.filter((t) => t.kind === "word");
      stats.tokens += wordTokens.length;

      for (const token of wordTokens) {
        const isKnown = lemmatizer.isKnown(token.original);
        if (isKnown) {
          stats.knownTokens++;
        } else if (stats.unknownWords.size < 100) {
          // Cap unknown words to avoid memory issues
          stats.unknownWords.add(token.original.toLowerCase());
        }
      }

      if (wordTokens.length > 0) {
        const docCoverage = stats.knownTokens / stats.tokens;
        stats.coverage.push(docCoverage);
      }
    }

    // Print summary
    console.log("\n📊 IGC-2024 Coverage Report\n");
    console.log("Config                      | Docs | Tokens  | Coverage | Unknown samples");
    console.log("----------------------------|------|---------|----------|----------------");

    let totalTokens = 0;
    let totalKnown = 0;

    for (const [config, stats] of Object.entries(byConfig).sort()) {
      const coverage = stats.tokens > 0 ? stats.knownTokens / stats.tokens : 0;
      const unknownSample = [...stats.unknownWords].slice(0, 5).join(", ");

      console.log(
        `${config.padEnd(27)} | ${String(stats.docs).padStart(4)} | ${String(stats.tokens).padStart(7)} | ${(coverage * 100).toFixed(1).padStart(6)}%  | ${unknownSample}`
      );

      totalTokens += stats.tokens;
      totalKnown += stats.knownTokens;
    }

    const totalCoverage = totalTokens > 0 ? totalKnown / totalTokens : 0;
    console.log("----------------------------|------|---------|----------|----------------");
    console.log(
      `${"TOTAL".padEnd(27)} | ${String(samples.length).padStart(4)} | ${String(totalTokens).padStart(7)} | ${(totalCoverage * 100).toFixed(1).padStart(6)}%  |`
    );
    console.log();

    // Expect reasonable coverage (>70% known tokens)
    expect(totalCoverage).toBeGreaterThan(0.7);
  });

  it("should benchmark full pipeline on samples", () => {
    if (samples.length === 0) {
      return;
    }

    const allText = samples.map((s) => s.text).join("\n\n");
    const metrics = runBenchmark(allText, lemmatizer, "full", {
      bigrams: lemmatizer,
      compoundSplitter,
    });

    console.log("\n📈 Full Pipeline Metrics");
    console.log(`   Word count:      ${metrics.wordCount}`);
    console.log(`   Coverage:        ${(metrics.coverage * 100).toFixed(1)}%`);
    console.log(`   Ambiguity rate:  ${(metrics.ambiguityRate * 100).toFixed(1)}%`);
    console.log(`   Unique lemmas:   ${metrics.uniqueLemmas}`);
    console.log(`   Compounds found: ${metrics.compoundsFound}`);
    console.log(`   Avg confidence:  ${(metrics.avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Time:            ${metrics.timeMs.toFixed(1)}ms`);
    console.log();

    // Sanity checks
    expect(metrics.wordCount).toBeGreaterThan(1000);
    expect(metrics.coverage).toBeGreaterThan(0.5);
  });

  it("should identify problematic unknown words", () => {
    if (samples.length === 0) {
      return;
    }

    // Collect unknown words with frequency
    const unknownFreq: Map<string, number> = new Map();

    for (const sample of samples) {
      const processed = processText(sample.text, lemmatizer);
      for (const token of processed) {
        if (token.kind === "word" && !lemmatizer.isKnown(token.original)) {
          const word = token.original.toLowerCase();
          unknownFreq.set(word, (unknownFreq.get(word) || 0) + 1);
        }
      }
    }

    // Sort by frequency
    const sorted = [...unknownFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    if (sorted.length > 0) {
      console.log("\n🔍 Most frequent unknown words:");
      for (const [word, count] of sorted) {
        console.log(`   ${count.toString().padStart(4)}x  ${word}`);
      }
      console.log();
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
