import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import { Lemmatizer, extractLemmas } from "../src/index.js";

describe("Lemmatizer", () => {
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

  it("should load data correctly", () => {
    expect(lemmatizer.lemmaCount).toBeGreaterThan(300000);
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
});

describe("extractLemmas", () => {
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

  it("should extract lemmas from text", () => {
    const lemmas = extractLemmas("Við fórum út", lemmatizer);
    // "við" -> ég, við, viður
    expect(lemmas.has("ég")).toBe(true);
    expect(lemmas.has("viður")).toBe(true);
    // "fórum" -> fara
    expect(lemmas.has("fara")).toBe(true);
    // "út" -> út
    expect(lemmas.has("út")).toBe(true);
  });

  it("should strip punctuation", () => {
    const lemmas = extractLemmas("Hús, garður.", lemmatizer);
    expect(lemmas.has("hús")).toBe(true);
    expect(lemmas.has("garður")).toBe(true);
  });
});
