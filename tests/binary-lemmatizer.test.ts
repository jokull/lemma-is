import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BinaryLemmatizer } from "../src/index.js";

describe("BinaryLemmatizer", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ));
  });

  it("should load data correctly", () => {
    expect(lemmatizer.lemmaCountValue).toBeGreaterThan(280000);
    expect(lemmatizer.wordFormCount).toBeGreaterThan(3000000);
  });

  it("should handle ambiguous word 'við'", () => {
    const lemmas = lemmatizer.lemmatize("við");
    expect(lemmas).toContain("ég"); // personal pronoun "we"
    expect(lemmas).toContain("viður"); // noun "wood"
    expect(lemmas).toContain("við"); // preposition
  });

  it("should handle noun declensions", () => {
    // hesti is dative of hestur (horse)
    const lemmas = lemmatizer.lemmatize("hesti");
    expect(lemmas).toContain("hestur");
  });

  it("should handle simple nouns", () => {
    const lemmas = lemmatizer.lemmatize("hús");
    expect(lemmas).toEqual(["hús"]);
  });

  it("should return unknown words as-is", () => {
    const lemmas = lemmatizer.lemmatize("xyz123unknown");
    expect(lemmas).toEqual(["xyz123unknown"]);
  });

  it("should be case-insensitive", () => {
    const lower = lemmatizer.lemmatize("hestur");
    const upper = lemmatizer.lemmatize("HESTUR");
    const mixed = lemmatizer.lemmatize("Hestur");
    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
  });

  it("should filter by word class", () => {
    const verbs = lemmatizer.lemmatize("á", { wordClass: "so" });
    expect(verbs).toContain("eiga");

    const nouns = lemmatizer.lemmatize("á", { wordClass: "no" });
    expect(nouns).toContain("á");
  });

  it("should return lemmas with POS", () => {
    const results = lemmatizer.lemmatizeWithPOS("á");
    expect(results.length).toBeGreaterThan(0);

    // Should have different POS tags
    const posTags = new Set(results.map((r) => r.pos));
    expect(posTags.size).toBeGreaterThan(1);
  });

  it("should look up bigram frequencies", () => {
    // Common bigram should have frequency
    const freq = lemmatizer.bigramFreq("að", "vera");
    expect(freq).toBeGreaterThan(0);

    // Non-existent bigram should return 0
    const noFreq = lemmatizer.bigramFreq("xyz", "abc");
    expect(noFreq).toBe(0);
  });

  it("should check if word is known", () => {
    expect(lemmatizer.isKnown("hestur")).toBe(true);
    expect(lemmatizer.isKnown("xyz123unknown")).toBe(false);
  });

  it("should have reasonable buffer size", () => {
    // Should be under 110MB (fits in 128MB Cloudflare limit with headroom)
    expect(lemmatizer.bufferSize).toBeLessThan(110 * 1024 * 1024);
    // Should be at least 30MB (not empty/corrupt)
    expect(lemmatizer.bufferSize).toBeGreaterThan(30 * 1024 * 1024);
  });
});
