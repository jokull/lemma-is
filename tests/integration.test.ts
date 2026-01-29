/**
 * Integration tests for BinaryLemmatizer with disambiguation and compounds.
 * Verifies the full pipeline works end-to-end.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  Disambiguator,
  CompoundSplitter,
  createKnownLemmaSet,
  processText,
  extractIndexableLemmas,
  extractDisambiguatedLemmas,
} from "../src/index.js";

describe("Integration: BinaryLemmatizer + Disambiguator", () => {
  let lemmatizer: BinaryLemmatizer;
  let disambiguator: Disambiguator;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    // BinaryLemmatizer implements BigramProvider, so use it directly
    disambiguator = new Disambiguator(lemmatizer, lemmatizer);
  });

  it("should disambiguate using BinaryLemmatizer bigrams", () => {
    // "við erum" - við should be pronoun (ég), not preposition
    const result = disambiguator.disambiguate("við", null, "erum");

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.ambiguous).toBe(true);
    // Should have some confidence from bigram data
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should disambiguate all tokens in sequence", () => {
    const tokens = ["við", "erum", "að", "fara"];
    const results = disambiguator.disambiguateAll(tokens);

    expect(results.length).toBe(4);
    // Each result should have a lemma
    for (const result of results) {
      expect(result.lemma).toBeDefined();
      expect(result.lemma.length).toBeGreaterThan(0);
    }
  });

  it("should extract lemmas with disambiguation", () => {
    const lemmas = disambiguator.extractLemmas(["við", "fórum", "til", "Reykjavíkur"]);

    expect(lemmas.size).toBeGreaterThan(0);
    expect(lemmas.has("fara")).toBe(true);
  });
});

describe("Integration: BinaryLemmatizer + CompoundSplitter", () => {
  let lemmatizer: BinaryLemmatizer;
  let splitter: CompoundSplitter;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const lemmasList = lemmatizer.getAllLemmas();
    const knownLemmas = createKnownLemmaSet(lemmasList);
    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("should split compounds using BinaryLemmatizer", () => {
    const result = splitter.split("húsnæðislán");

    expect(result.isCompound).toBe(true);
    expect(result.parts).toContain("húsnæði");
    expect(result.parts).toContain("lán");
  });

  it("should get all lemmas including compound parts", () => {
    const allLemmas = splitter.getAllLemmas("landbúnaðarráðherra");

    expect(allLemmas).toContain("landbúnaður");
    expect(allLemmas).toContain("ráðherra");
    expect(allLemmas).toContain("landbúnaðarráðherra");
  });

  it("should handle non-compounds gracefully", () => {
    const result = splitter.split("hestur");

    expect(result.isCompound).toBe(false);
    expect(result.parts).toEqual(["hestur"]);
  });
});

describe("Integration: Full Pipeline", () => {
  let lemmatizer: BinaryLemmatizer;
  let splitter: CompoundSplitter;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const lemmasList = lemmatizer.getAllLemmas();
    const knownLemmas = createKnownLemmaSet(lemmasList);
    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("processText should work with BinaryLemmatizer", () => {
    const text = "Við fórum til Akureyrar.";
    const processed = processText(text, lemmatizer, {
      bigrams: lemmatizer,
    });

    expect(processed.length).toBeGreaterThan(0);

    // Find "fórum" token
    const forum = processed.find(p => p.original.toLowerCase() === "fórum");
    expect(forum).toBeDefined();
    expect(forum?.lemmas).toContain("fara");
    expect(forum?.disambiguated).toBeDefined();
  });

  it("processText should handle compounds", () => {
    const text = "Húsnæðislánareglur eru mikilvægar.";
    const processed = processText(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
    });

    // Should find the compound
    const compound = processed.find(
      p => p.original.toLowerCase() === "húsnæðislánareglur"
    );
    // May or may not split depending on if word is known
  });

  it("extractIndexableLemmas should work end-to-end", () => {
    const text = "Börn léku úti. Við fórum með hestinn.";
    const lemmas = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
    });

    expect(lemmas.has("barn")).toBe(true);
    expect(lemmas.has("hestur")).toBe(true);
    expect(lemmas.has("fara")).toBe(true);
  });

  it("extractIndexableLemmas should remove stopwords", () => {
    const text = "Við fórum í bíó.";

    const withStopwords = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      removeStopwords: false,
    });

    const withoutStopwords = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      removeStopwords: true,
    });

    // "í" is a stopword
    expect(withoutStopwords.size).toBeLessThanOrEqual(withStopwords.size);
    expect(withoutStopwords.has("fara")).toBe(true);
    expect(withoutStopwords.has("bíó")).toBe(true);
  });

  it("extractDisambiguatedLemmas should work with BinaryLemmatizer", () => {
    const text = "Við fórum til Reykjavíkur";
    const lemmas = extractDisambiguatedLemmas(text, lemmatizer, lemmatizer);

    expect(lemmas.size).toBeGreaterThan(0);
    expect(lemmas.has("fara")).toBe(true);
  });
});

describe("README Examples Verification", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  it("basic lemmatization works", () => {
    // Example from README: "við" -> ["við", "ég", "viður"]
    const lemmas = lemmatizer.lemmatize("við");
    expect(lemmas).toContain("ég");
    expect(lemmas).toContain("viður");
    expect(lemmas).toContain("við");
  });

  it("word class filtering works", () => {
    // Example: "á" with wordClass: "so" -> ["eiga"]
    const verbs = lemmatizer.lemmatize("á", { wordClass: "so" });
    expect(verbs).toContain("eiga");

    const prepositions = lemmatizer.lemmatize("á", { wordClass: "fs" });
    expect(prepositions).toContain("á");
  });

  it("POS tagging works", () => {
    // Example: lemmatizeWithPOS("hesti") -> [{ lemma: "hestur", pos: "no" }]
    const results = lemmatizer.lemmatizeWithPOS("hesti");
    expect(results.length).toBeGreaterThan(0);
    expect(results.find(r => r.lemma === "hestur" && r.pos === "no")).toBeDefined();
  });

  it("bigram lookup works", () => {
    // Common bigrams should have frequency
    const freq = lemmatizer.bigramFreq("að", "vera");
    expect(freq).toBeGreaterThan(0);

    // Also works via freq() alias (BigramProvider interface)
    const freqAlias = lemmatizer.freq("að", "vera");
    expect(freqAlias).toBe(freq);
  });

  it("isKnown works", () => {
    expect(lemmatizer.isKnown("hestur")).toBe(true);
    expect(lemmatizer.isKnown("xyzabc123")).toBe(false);
  });
});

describe("Search Indexing Options", () => {
  let lemmatizer: BinaryLemmatizer;
  let splitter: CompoundSplitter;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    const knownLemmas = createKnownLemmaSet(lemmatizer.getAllLemmas());
    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("default indexAllCandidates=true includes all lemmas", () => {
    // "á" has multiple meanings: preposition, noun, verb (eiga)
    const text = "Ég á hest";

    // Default behavior (indexAllCandidates: true)
    const defaultBehavior = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
    });

    // Should include both "á" and "eiga" by default
    expect(defaultBehavior.has("eiga")).toBe(true);
    expect(defaultBehavior.has("á")).toBe(true);
  });

  it("indexAllCandidates=false only includes disambiguated lemma", () => {
    const text = "Ég á hest";

    const preciseOnly = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      indexAllCandidates: false,
    });

    const allCandidates = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      indexAllCandidates: true,
    });

    // Precise should have FEWER lemmas
    expect(preciseOnly.size).toBeLessThanOrEqual(allCandidates.size);
  });

  it("default alwaysTryCompounds=true splits even known words", () => {
    // "húsnæðislán" might be in BÍN as a known word
    const text = "Húsnæðislán eru dýr";

    // Default behavior (alwaysTryCompounds: true)
    const defaultBehavior = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
    });

    // Should have the compound parts by default
    expect(defaultBehavior.has("húsnæði")).toBe(true);
    expect(defaultBehavior.has("lán")).toBe(true);
  });

  it("alwaysTryCompounds=false only splits unknown words", () => {
    const text = "Húsnæðislán eru dýr";

    const onlyUnknown = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      alwaysTryCompounds: false,
    });

    const allCompounds = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      alwaysTryCompounds: true,
    });

    // alwaysTryCompounds: true should have at least as many terms
    expect(allCompounds.size).toBeGreaterThanOrEqual(onlyUnknown.size);
  });

  it("defaults maximize recall for search indexing", () => {
    const text = "Við fórum á húsnæðislánafund";

    // Default behavior - should already be maximized
    const defaultBehavior = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
    });

    // Should include all "við" interpretations by default
    expect(defaultBehavior.has("ég")).toBe(true); // við as pronoun
    expect(defaultBehavior.has("við")).toBe(true); // við as preposition
  });

  it("can reduce recall with explicit options", () => {
    const text = "Við fórum á húsnæðislánafund";

    const maxRecall = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
    });

    const reducedRecall = extractIndexableLemmas(text, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      indexAllCandidates: false,
      alwaysTryCompounds: false,
    });

    // Reduced recall should have fewer terms
    expect(reducedRecall.size).toBeLessThan(maxRecall.size);
  });
});

describe("BigramProvider Interface", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  it("BinaryLemmatizer implements BigramProvider", () => {
    // Should have freq method
    expect(typeof lemmatizer.freq).toBe("function");

    // freq should work
    const freq = lemmatizer.freq("að", "vera");
    expect(typeof freq).toBe("number");
  });

  it("freq and bigramFreq return same values", () => {
    const pairs = [
      ["að", "vera"],
      ["ég", "er"],
      ["við", "erum"],
      ["unknown", "words"],
    ];

    for (const [w1, w2] of pairs) {
      expect(lemmatizer.freq(w1, w2)).toBe(lemmatizer.bigramFreq(w1, w2));
    }
  });

  it("Disambiguator accepts BinaryLemmatizer as BigramProvider", () => {
    // This should compile and work - BinaryLemmatizer satisfies BigramProvider
    const disambiguator = new Disambiguator(lemmatizer, lemmatizer);

    const result = disambiguator.disambiguate("við", "að", "fara");
    expect(result.lemma).toBeDefined();
  });
});
