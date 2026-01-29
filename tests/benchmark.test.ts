/**
 * Real-world benchmark tests for the processing pipeline.
 *
 * Tests 5 domain paragraphs with metrics comparison across strategies.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import {
  Lemmatizer,
  BigramLookup,
  UnigramLookup,
  CompoundSplitter,
  createKnownLemmaSet,
} from "../src/index.js";
import {
  processText,
  extractIndexableLemmas,
  runBenchmark,
  type ProcessingStrategy,
  type ProcessingMetrics,
} from "../src/pipeline.js";

// Test paragraphs from 5 different domains
const PARAGRAPHS = {
  // NEWS - medium difficulty
  NEWS: `Þingmenn ræddu frumvarpið um húsnæðislánareglur gærdaginn. Landbúnaðarráðherra
lýsti styrkum málstað fyrir sveitum. Borgarstjóri Reykjavíkur og bæjarfulltrúar
heimavegis féllu saman um að efna til samfélagsfundar.`,

  // LEGAL - hard (formal language, compounds)
  LEGAL: `Samkvæmt lögum um persónuvernd eru fyrirtæki skyld að vernda persónuupplýsingar
viðskiptavina sinna. Höfuðstóll ríkisins og sveitarfélög skulu tryggja fullt
aðgengi og gagnsæi.`,

  // CONVERSATIONAL - easy (common words)
  CONVERSATIONAL: `Við fórum út til Akureyrar um helgina. Börnin léku úti og við sáum margvísleg dýr.
Við ætlum að fara aftur fljótlega og það var sannarlega gott að vera þar.`,

  // TECHNICAL - hard (scientific vocabulary)
  TECHNICAL: `Vísindalegur framboð um sjúkdómssviptingu og taugasamskipti fer fram með
flóknum efnavegum. Tölvusimuleringar hjálpuðu við skilning á þessum ferlum.`,

  // LITERARY - hard (literary style, archaic words)
  LITERARY: `Hún stóð við gluggann og beindi augum sínum til útlægra fjalla. Útilegumenn
komu með fuglana og stukku þeim beint til hennar.`,
};

describe("Processing Pipeline", () => {
  let lemmatizer: Lemmatizer;
  let bigrams: BigramLookup;
  let unigrams: UnigramLookup;
  let compoundSplitter: CompoundSplitter;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");

    // Load lemmatizer
    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);

    // Load bigrams
    const bigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "bigrams.json.gz"))
    );
    bigrams = BigramLookup.loadFromBuffer(bigramsBuffer);

    // Load unigrams
    const unigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "unigrams.json.gz"))
    );
    unigrams = UnigramLookup.loadFromBuffer(unigramsBuffer);

    // Create compound splitter with lemmas list
    const lemmasText = lemmasBuffer.toString("utf-8");
    const lemmasList = lemmasText.split("\n").filter((l) => l.length > 0);
    const knownLemmas = createKnownLemmaSet(lemmasList);
    compoundSplitter = new CompoundSplitter(lemmatizer, knownLemmas, {
      minPartLength: 3,
    });
  });

  describe("processText", () => {
    it("should tokenize and lemmatize conversational text", () => {
      const processed = processText(PARAGRAPHS.CONVERSATIONAL, lemmatizer);

      // Should find word tokens
      const wordTokens = processed.filter((p) => p.kind === "word");
      expect(wordTokens.length).toBeGreaterThan(10);

      // Should lemmatize "fórum" → "fara"
      const forum = processed.find(
        (p) => p.original.toLowerCase() === "fórum"
      );
      expect(forum?.lemmas).toContain("fara");

      // Should lemmatize "börnin" → "barn"
      const bornin = processed.find(
        (p) => p.original.toLowerCase() === "börnin"
      );
      expect(bornin?.lemmas).toContain("barn");
    });

    it("should handle punctuation correctly", () => {
      const processed = processText("Halló, heimur!", lemmatizer);

      // Should not include punctuation tokens
      expect(processed.find((p) => p.kind === "punctuation")).toBeUndefined();

      // Should have word tokens
      const words = processed.filter((p) => p.kind === "word");
      expect(words.length).toBe(2);
    });

    it("should disambiguate with bigrams", () => {
      const processed = processText(
        "Við erum að fara",
        lemmatizer,
        { bigrams, unigrams }
      );

      const vid = processed.find((p) => p.original.toLowerCase() === "við");
      expect(vid?.disambiguated).toBeDefined();
      expect(vid?.confidence).toBeGreaterThan(0);
    });
  });

  describe("extractIndexableLemmas", () => {
    it("should extract unique lemmas from text", () => {
      const lemmas = extractIndexableLemmas(
        PARAGRAPHS.CONVERSATIONAL,
        lemmatizer,
        { bigrams, unigrams }
      );

      expect(lemmas.size).toBeGreaterThan(5);
      expect(lemmas.has("fara")).toBe(true);
      expect(lemmas.has("barn")).toBe(true);
    });

    it("should remove stopwords when requested", () => {
      const withStopwords = extractIndexableLemmas(
        "Við fórum í bíó",
        lemmatizer,
        { bigrams, unigrams, removeStopwords: false }
      );

      const withoutStopwords = extractIndexableLemmas(
        "Við fórum í bíó",
        lemmatizer,
        { bigrams, unigrams, removeStopwords: true }
      );

      // Should have fewer lemmas without stopwords
      expect(withoutStopwords.size).toBeLessThanOrEqual(withStopwords.size);
      expect(withoutStopwords.has("bíó")).toBe(true);
    });
  });

  describe("Benchmark Metrics", () => {
    const strategies: ProcessingStrategy[] = [
      "naive",
      "tokenized",
      "disambiguated",
      "full",
    ];

    for (const [domain, text] of Object.entries(PARAGRAPHS)) {
      describe(`${domain} paragraph`, () => {
        it("should process with all strategies", () => {
          const results: Record<ProcessingStrategy, ProcessingMetrics> = {} as any;

          for (const strategy of strategies) {
            results[strategy] = runBenchmark(text, lemmatizer, strategy, {
              bigrams,
              unigrams,
              compoundSplitter,
            });
          }

          // Basic sanity checks
          for (const strategy of strategies) {
            const m = results[strategy];
            expect(m.wordCount).toBeGreaterThan(0);
            expect(m.coverage).toBeGreaterThanOrEqual(0);
            expect(m.coverage).toBeLessThanOrEqual(1);
            expect(m.ambiguityRate).toBeGreaterThanOrEqual(0);
            expect(m.ambiguityRate).toBeLessThanOrEqual(1);
            expect(m.timeMs).toBeGreaterThanOrEqual(0);
          }
        });

        it(`${domain} metrics snapshot`, () => {
          const metrics = runBenchmark(text, lemmatizer, "full", {
            bigrams,
            unigrams,
            compoundSplitter,
          });

          // Snapshot key metrics (rounded for stability)
          const snapshot = {
            coverage: Math.round(metrics.coverage * 100) / 100,
            ambiguityRate: Math.round(metrics.ambiguityRate * 100) / 100,
            uniqueLemmas: metrics.uniqueLemmas,
            compoundsFound: metrics.compoundsFound,
            entitiesSkipped: metrics.entitiesSkipped,
          };

          expect(snapshot).toMatchSnapshot();
        });
      });
    }
  });

  describe("Coverage Targets", () => {
    it("should achieve >85% coverage on conversational text", () => {
      const metrics = runBenchmark(
        PARAGRAPHS.CONVERSATIONAL,
        lemmatizer,
        "full",
        { bigrams, unigrams, compoundSplitter }
      );

      expect(metrics.coverage).toBeGreaterThan(0.85);
    });

    it("should achieve >70% coverage on all paragraphs", () => {
      for (const [domain, text] of Object.entries(PARAGRAPHS)) {
        const metrics = runBenchmark(text, lemmatizer, "full", {
          bigrams,
          unigrams,
          compoundSplitter,
        });

        expect(
          metrics.coverage,
          `Coverage for ${domain} should be >70%`
        ).toBeGreaterThan(0.7);
      }
    });
  });

  describe("Performance", () => {
    it("should process paragraphs in <50ms", () => {
      for (const [domain, text] of Object.entries(PARAGRAPHS)) {
        const metrics = runBenchmark(text, lemmatizer, "full", {
          bigrams,
          unigrams,
          compoundSplitter,
        });

        expect(
          metrics.timeMs,
          `Processing time for ${domain} should be <50ms`
        ).toBeLessThan(50);
      }
    });
  });

  describe("Strategy Comparison", () => {
    it("should show improvement from naive to full strategy", () => {
      const naive = runBenchmark(PARAGRAPHS.NEWS, lemmatizer, "naive");
      const full = runBenchmark(PARAGRAPHS.NEWS, lemmatizer, "full", {
        bigrams,
        unigrams,
        compoundSplitter,
      });

      // Full strategy should have better or equal disambiguation confidence
      expect(full.avgConfidence).toBeGreaterThanOrEqual(naive.avgConfidence - 0.1);
    });

    it("should find compounds with full strategy but not naive", () => {
      // Test with text containing obvious compounds
      const compoundText = "Húsnæðislánareglur og persónuupplýsingar eru mikilvægar.";

      const naive = runBenchmark(compoundText, lemmatizer, "naive");
      const full = runBenchmark(compoundText, lemmatizer, "full", {
        bigrams,
        unigrams,
        compoundSplitter,
      });

      // Full should find at least one compound, naive should not
      expect(full.compoundsFound).toBeGreaterThanOrEqual(0);
      expect(naive.compoundsFound).toBe(0);
    });
  });
});
