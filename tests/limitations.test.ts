/**
 * Limitations tests - exposing current weaknesses and research questions
 *
 * These tests document known limitations of the current approach
 * and point toward potential improvements.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  Disambiguator,
  CompoundSplitter,
  createKnownLemmaSet,
} from "../src/index.js";

describe("LIMITATION: Disambiguation without sufficient context", () => {
  let lemmatizer: BinaryLemmatizer;
  let disambiguator: Disambiguator;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    disambiguator = new Disambiguator(lemmatizer, lemmatizer);
  });

  it("single word without context has low confidence", () => {
    // Without any context, "á" could be anything
    const result = disambiguator.disambiguate("á", null, null);

    expect(result.ambiguous).toBe(true);
    // RESEARCH: Could use unigram frequency as tiebreaker
    // The preposition "á" is far more common than "eiga" or the river
  });

  it("rare bigrams don't help disambiguation", () => {
    // If the bigram isn't in our data (freq < 50), we can't use it
    // This is a tradeoff: smaller data = less coverage
    const rareContext = disambiguator.disambiguate("á", "sjaldgæfur", null);

    // RESEARCH: Could interpolate with unigrams or use smoothing
    expect(rareContext.ambiguous).toBe(true);
  });

  it("no word class (POS) information available", () => {
    // We know "á" maps to [á, eiga] but not WHICH one is verb vs preposition
    const lemmas = lemmatizer.lemmatize("á");

    // RESEARCH: Store word class with lemmas? Would increase data size
    // Format could be: "á:prep", "eiga:verb"
    expect(lemmas.length).toBeGreaterThan(1);
    // Currently no way to filter by "only verbs" or "only nouns"
  });
});

describe("LIMITATION: Bigrams only (no trigrams)", () => {
  let lemmatizer: BinaryLemmatizer;
  let disambiguator: Disambiguator;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    disambiguator = new Disambiguator(lemmatizer, lemmatizer);
  });

  it("loses context in 3+ word patterns", () => {
    // "ég á hest" (I own a horse) vs "ég er á hesti" (I am on a horse)
    // With only bigrams, we see:
    //   "ég á" and "á hest" vs "ég er", "er á", "á hesti"
    // Trigrams would give us "ég á hest" vs "er á hesti" - much clearer!

    // Current approach: use both left and right bigrams
    const ownsHorse = disambiguator.disambiguate("á", "ég", "hest");
    const onHorse = disambiguator.disambiguate("á", "er", "hesti");

    // RESEARCH: icegrams has trigrams (41MB) - could use for high-value cases
    // Or: train a small model to score (prev, word, next) triples
    expect(ownsHorse.ambiguous).toBe(true);
    expect(onHorse.ambiguous).toBe(true);
  });
});

describe("LIMITATION: Compound splitting heuristics", () => {
  let lemmatizer: BinaryLemmatizer;
  let splitter: CompoundSplitter;
  let knownLemmas: Set<string>;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const lemmasList = lemmatizer.getAllLemmas();
    knownLemmas = createKnownLemmaSet(lemmasList);
    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("may split at wrong boundary", () => {
    // "landsins" could be split as "land" + "sins" or just be genitive of "land"
    // Our heuristic checks if both parts are known words
    const result = splitter.split("landsins");

    // This is NOT a compound - it's "land" with definite article genitive suffix
    // RESEARCH: Need to distinguish compounds from inflected forms
    // BÍN has this info but we don't currently use it
    expect(result.isCompound).toBe(false); // Should be false (it's just "land" inflected)
  });

  it("three-part compounds are only split once", () => {
    // "þjóðmálaráðherra" = þjóð + mál + ráðherra (foreign affairs minister)
    // Current approach only does binary splits
    const result = splitter.split("þjóðmálaráðherra");

    // RESEARCH: Recursive splitting for multi-part compounds
    // Would need to balance precision vs over-splitting
    if (result.isCompound) {
      expect(result.parts.length).toBe(2); // Only 2 parts currently
      // Ideally would be 3: þjóð, mál, ráðherra
    }
  });

  it("misses compounds with inflected first parts", () => {
    // "húseignir" = hús + eignir (houses + properties → real estate)
    // But "hús" might appear as "húsa" or "húss" in compound
    const result = splitter.split("húseignir");

    // RESEARCH: Need to try lemmatized forms of potential first parts
    // Would increase search space significantly
  });
});

describe("LIMITATION: No handling of neologisms or brand names", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  it("returns unknown words as-is (but BÍN is surprisingly complete!)", () => {
    // Surprisingly, "appið" IS in BÍN and resolves to "app"
    const appid = lemmatizer.lemmatize("appið");
    expect(appid).toContain("app"); // BÍN has this!

    // But truly unknown words return as-is
    const madeUp = lemmatizer.lemmatize("blörfið"); // nonsense word
    expect(madeUp).toEqual(["blörfið"]);

    // RESEARCH: For unknown words ending in known suffixes (-ið, -inn, etc.)
    // could try stripping the suffix and checking if stem exists
  });

  it("loanwords may not be in BÍN", () => {
    // English loanwords adapted to Icelandic
    const podcast = lemmatizer.lemmatize("hlaðvarpið"); // "the podcast"

    // Some new words are in BÍN, others aren't
    // This depends on how recent the BÍN version is
    const lemmas = lemmatizer.lemmatize("hlaðvarpið");
    // If in BÍN, great! If not, returned as-is
  });
});

describe("LIMITATION: Article-fused forms", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  it("definite articles are fused with nouns", () => {
    // "hús" + "ið" → "húsið" (the house)
    // "hestur" + "inn" → "hesturinn" (the horse)
    // These ARE in BÍN so they work:
    const husid = lemmatizer.lemmatize("húsið");
    const hesturinn = lemmatizer.lemmatize("hesturinn");

    expect(husid).toContain("hús");
    expect(hesturinn).toContain("hestur");

    // But for search, should "húsið" also index "ið" as a separate concept?
    // Usually no - the article is grammatical, not semantic
    // RESEARCH: For some applications, might want to track definiteness
  });
});

describe("LIMITATION: No morphological generation", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  it("cannot go from lemma to inflected forms", () => {
    // We can: "hestinum" → "hestur"
    // We cannot: "hestur" → ["hestur", "hest", "hesti", "hests", ...]

    // This matters for:
    // 1. Query expansion: user searches "hestur", expand to all forms
    // 2. Highlighting: show which forms matched in results

    // RESEARCH: Would need inverse index or BÍN paradigm tables
    // Size impact: significant (each lemma has 20-50+ forms for nouns)
    expect(true).toBe(true); // Documenting limitation
  });
});

describe("LIMITATION: Homograph frequency ranking", () => {
  // Note: Reuses lemmatizer from earlier tests - no new loading needed
  // These are documentation tests showing what we DON'T have

  it("lemmas returned in arbitrary order (no frequency ranking)", () => {
    // "við" returns ["við", "viður", "ég"] - in what order?
    // The order is deterministic (alphabetical by lemma index) but not frequency-based
    // "ég" (we-pronoun) is FAR more common than "viður" (wood)

    // RESEARCH: Could store/sort by corpus frequency
    // Would help for "most likely" fallback when no context
    // icegrams has unigram frequencies: storage.unigram_frequency(word_id)

    // RESEARCH: Extract unigram frequencies from icegrams
    // Store as: word -> frequency (could use same TSV format)
    // Size estimate: ~1-2MB for top 100k words

    expect(true).toBe(true); // Documentation test
  });
});

describe("POTENTIAL IMPROVEMENT: Word embeddings for semantic search", () => {
  it("documents semantic limitation", () => {
    // Current approach: exact lemma matching
    // "hestur" matches "hestur" but not "hross" (also means horse)
    // "maður" matches "maður" but not "manneskja" (human being)

    // For true semantic search, would need:
    // 1. Word embeddings (word2vec, fastText for Icelandic)
    // 2. Or: manually curated synonym lists

    // RESEARCH: Icelandic word embeddings exist (various research projects)
    // Size impact: 50-200MB+ for full embeddings
    // Could use reduced/quantized versions for browser
    expect(true).toBe(true);
  });
});
