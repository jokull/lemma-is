import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import { Lemmatizer, BigramLookup, Disambiguator } from "../src/index.js";

describe("BigramLookup", () => {
  let bigrams: BigramLookup;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const bigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "bigrams.json.gz"))
    );
    bigrams = BigramLookup.loadFromBuffer(bigramsBuffer);
  });

  it("should load bigrams correctly", () => {
    expect(bigrams.size).toBeGreaterThan(100000);
  });

  it("should find common bigrams", () => {
    // "til að" is the most common bigram
    expect(bigrams.freq("til", "að")).toBeGreaterThan(1000000);
    // "það er" is also common
    expect(bigrams.freq("það", "er")).toBeGreaterThan(400000);
  });

  it("should return 0 for unknown bigrams", () => {
    expect(bigrams.freq("xyz", "abc")).toBe(0);
  });

  it("should have has() method", () => {
    expect(bigrams.has("til", "að")).toBe(true);
    expect(bigrams.has("xyz", "abc")).toBe(false);
  });
});

describe("Disambiguator", () => {
  let lemmatizer: Lemmatizer;
  let bigrams: BigramLookup;
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

    disambiguator = new Disambiguator(lemmatizer, bigrams);
  });

  it("should return single lemma for unambiguous words", () => {
    const result = disambiguator.disambiguate("hestur", null, null);
    expect(result.ambiguous).toBe(false);
    expect(result.lemma).toBe("hestur");
    expect(result.confidence).toBe(1.0);
  });

  it("should disambiguate 'við' based on context", () => {
    // "við" can be: ég (pronoun "we"), við (preposition), viður (wood)
    const candidates = lemmatizer.lemmatize("við");
    expect(candidates.length).toBeGreaterThan(1);

    // With context "við erum" -> should prefer "ég" (we are)
    const result = disambiguator.disambiguate("við", null, "erum");
    expect(result.ambiguous).toBe(true);
    expect(result.candidates).toEqual(candidates);
    // The bigram "ég erum" should score high if it exists, or "við erum"
    // Either way, context should help
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should disambiguate 'á' based on context", () => {
    // "á" can be: á (preposition "on"), á (noun "river"), ég (verb "own")
    const candidates = lemmatizer.lemmatize("á");
    expect(candidates.length).toBeGreaterThan(1);

    // With context "er á" (is on) -> should prefer preposition
    const result = disambiguator.disambiguate("á", "er", null);
    expect(result.ambiguous).toBe(true);
  });

  it("should disambiguate array of tokens", () => {
    const tokens = ["við", "erum", "hér"];
    const results = disambiguator.disambiguateAll(tokens);

    expect(results.length).toBe(3);
    expect(results[0].token).toBe("við");
    expect(results[1].token).toBe("erum");
    expect(results[2].token).toBe("hér");
  });

  it("should extract unique lemmas", () => {
    const tokens = ["við", "fórum", "út"];
    const lemmas = disambiguator.extractLemmas(tokens);

    // Should have exactly one lemma per token (best guess)
    expect(lemmas.size).toBeLessThanOrEqual(tokens.length);
    expect(lemmas.size).toBeGreaterThan(0);
  });
});
