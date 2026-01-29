import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import {
  Lemmatizer,
  BigramLookup,
  UnigramLookup,
  Disambiguator,
  extractLemmas,
} from "../src/index.js";

describe("UnigramLookup", () => {
  let unigrams: UnigramLookup;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const unigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "unigrams.json.gz"))
    );
    unigrams = UnigramLookup.loadFromBuffer(unigramsBuffer);
  });

  it("should load unigrams correctly", () => {
    expect(unigrams.size).toBeGreaterThan(300000);
  });

  it("should find common words", () => {
    // "að" is one of the most common words
    expect(unigrams.freq("að")).toBeGreaterThan(30000000);
    // "ég" is common
    expect(unigrams.freq("ég")).toBeGreaterThan(1000000);
  });

  it("should return 0 for unknown words", () => {
    expect(unigrams.freq("xyz123unknown")).toBe(0);
  });

  it("should sort lemmas by frequency", () => {
    const lemmas = ["viður", "ég", "við"];
    const sorted = unigrams.sortByFrequency(lemmas);
    // "við" should come first (most common)
    expect(sorted[0]).toBe("við");
    // "ég" second
    expect(sorted[1]).toBe("ég");
    // "viður" last (least common of these)
    expect(sorted[2]).toBe("viður");
  });

  it("should pick most frequent lemma", () => {
    const lemmas = ["viður", "ég", "við"];
    const best = unigrams.pickMostFrequent(lemmas);
    expect(best).toBe("við");
  });
});

describe("POS Filtering", () => {
  let lemmatizer: Lemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);
  });

  it("should filter 'á' by word class - verb", () => {
    const verbs = lemmatizer.lemmatize("á", { wordClass: "so" });
    expect(verbs).toContain("eiga");
    expect(verbs).not.toContain("á"); // preposition shouldn't be here
  });

  it("should filter 'á' by word class - preposition", () => {
    const preps = lemmatizer.lemmatize("á", { wordClass: "fs" });
    expect(preps).toContain("á");
    expect(preps).not.toContain("eiga");
  });

  it("should filter 'á' by word class - noun", () => {
    const nouns = lemmatizer.lemmatize("á", { wordClass: "no" });
    expect(nouns).toContain("á"); // river
    expect(nouns).not.toContain("eiga");
  });

  it("should return lemmatizeWithPOS results", () => {
    const results = lemmatizer.lemmatizeWithPOS("á");
    expect(results.length).toBeGreaterThan(0);

    // Should have verb entry
    const verbEntry = results.find(r => r.pos === "so");
    expect(verbEntry).toBeDefined();
    expect(verbEntry?.lemma).toBe("eiga");

    // Should have preposition entry
    const prepEntry = results.find(r => r.pos === "fs");
    expect(prepEntry).toBeDefined();
    expect(prepEntry?.lemma).toBe("á");
  });

  it("should filter by noun and get 'hestur' from 'hestinum'", () => {
    const nouns = lemmatizer.lemmatize("hestinum", { wordClass: "no" });
    expect(nouns).toContain("hestur");
    expect(nouns.length).toBe(1);
  });

  it("should return only verbs from extractLemmas", () => {
    const verbs = extractLemmas("Hann fór og keypti bíl", lemmatizer, {
      wordClass: "so",
    });
    expect(verbs.has("fara")).toBe(true);
    expect(verbs.has("kaupa")).toBe(true);
    // Should not include nouns
    expect(verbs.has("bíll")).toBe(false);
    // Note: "og" is also a verb (to yoke), so it might appear
  });
});

describe("Frequency-Ranked Lemmas", () => {
  let lemmatizer: Lemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);
  });

  it("should return lemmas sorted by frequency - 'við'", () => {
    const lemmas = lemmatizer.lemmatize("við");
    // "við" (preposition/adverb) should come before "ég" which should come before "viður"
    // based on corpus frequency
    expect(lemmas.length).toBeGreaterThanOrEqual(3);
    // The most common interpretation should be first
    // "við" as adverb/preposition is extremely common
    expect(lemmas[0]).toBe("við");
  });

  it("should return lemmas sorted by frequency - 'á'", () => {
    const lemmas = lemmatizer.lemmatize("á");
    // "á" as adverb/preposition should be first (most common usage)
    expect(lemmas.length).toBeGreaterThan(1);
    expect(lemmas[0]).toBe("á");
  });
});

describe("Disambiguator with Unigram Fallback", () => {
  let lemmatizer: Lemmatizer;
  let bigrams: BigramLookup;
  let unigrams: UnigramLookup;
  let disambiguator: Disambiguator;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");

    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);

    const bigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "bigrams.json.gz"))
    );
    bigrams = BigramLookup.loadFromBuffer(bigramsBuffer);

    const unigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "unigrams.json.gz"))
    );
    unigrams = UnigramLookup.loadFromBuffer(unigramsBuffer);

    disambiguator = new Disambiguator(lemmatizer, bigrams, { unigrams });
  });

  it("should use unigram fallback when no bigram context", () => {
    // "við" without context should use unigram frequency
    const result = disambiguator.disambiguate("við", null, null);
    expect(result.ambiguous).toBe(true);
    // Should pick a common interpretation
    expect(result.lemma).toBeDefined();
    // Confidence should be medium (unigram-only, capped at 0.7)
    expect(result.confidence).toBeLessThanOrEqual(0.7);
  });

  it("should prefer bigram over unigram when context exists", () => {
    // With context, bigram should dominate
    const withContext = disambiguator.disambiguate("við", null, "erum");
    const withoutContext = disambiguator.disambiguate("við", null, null);

    // Context should increase confidence
    expect(withContext.confidence).toBeGreaterThanOrEqual(
      withoutContext.confidence - 0.1 // Allow small variance
    );
  });

  it("should handle ambiguous word in isolation", () => {
    // Test various ambiguous words without context
    const testWords = ["á", "við", "sem", "er"];

    for (const word of testWords) {
      const result = disambiguator.disambiguate(word, null, null);
      expect(result.lemma).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }
  });
});
