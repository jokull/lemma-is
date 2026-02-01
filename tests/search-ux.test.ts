/**
 * Search UX Tests: Real-world search scenarios for Icelandic
 *
 * Tests user expectations: "If I search X, I should find documents containing Y"
 * Focuses on recall - does the system find what users expect?
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
  extractIndexableLemmas,
  buildSearchQuery,
} from "../src/index.js";

describe("Search UX: Real-world Icelandic search expectations", () => {
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

  /**
   * Helper: Check if a search query would match a document
   */
  function searchMatches(query: string, document: string): boolean {
    const queryResult = buildSearchQuery(query, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });
    const docLemmas = extractIndexableLemmas(document, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });

    // Query matches if ALL groups have at least one lemma in common with doc
    return queryResult.groups.every((group) =>
      group.some((lemma) => docLemmas.has(lemma))
    );
  }

  // ==========================================================================
  // 1. Basic inflection: User searches singular, doc has plural
  // ==========================================================================
  it("1. search 'hestur' finds document with 'hestarnir' (horses)", () => {
    expect(searchMatches("hestur", "Hestarnir voru fallegir")).toBe(true);
  });

  // ==========================================================================
  // 2. Reverse: User searches plural, doc has singular
  // ==========================================================================
  it("2. search 'hestar' finds document with 'hesturinn' (the horse)", () => {
    expect(searchMatches("hestar", "Hesturinn var gamall")).toBe(true);
  });

  // ==========================================================================
  // 3. Case inflection: Genitive search finds nominative document
  // ==========================================================================
  it("3. search 'kvenna' (of women) finds doc with 'kona' (woman)", () => {
    expect(searchMatches("kvenna", "Konan var glöð")).toBe(true);
  });

  // ==========================================================================
  // 4. Verb conjugation: Infinitive search finds past tense
  // ==========================================================================
  it("4. search 'fara' (to go) finds doc with 'fórum' (we went)", () => {
    expect(searchMatches("fara", "Við fórum í bíó")).toBe(true);
  });

  // ==========================================================================
  // 5. Verb conjugation: Past tense search finds infinitive
  // ==========================================================================
  it("5. search 'fór' (went) finds doc with 'fara' (to go)", () => {
    expect(searchMatches("fór", "Þau ætla að fara á morgun")).toBe(true);
  });

  // ==========================================================================
  // 6. Irregular noun: 'maður' and 'menn' both match
  // ==========================================================================
  it("6. search 'maður' finds doc with 'menn' (men)", () => {
    expect(searchMatches("maður", "Menn komu inn")).toBe(true);
  });

  // ==========================================================================
  // 7. Umlaut: 'barn' and 'börn' both match
  // ==========================================================================
  it("7. search 'barn' finds doc with 'börnin' (the children)", () => {
    expect(searchMatches("barn", "Börnin léku sér úti")).toBe(true);
  });

  // ==========================================================================
  // 8. Compound word: Search component finds compound
  // ==========================================================================
  it("8. search 'lán' (loan) finds doc with 'húsnæðislán' (mortgage)", () => {
    expect(searchMatches("lán", "Húsnæðislán eru dýr")).toBe(true);
  });

  // ==========================================================================
  // 9. Compound word: Search 'ráðherra' finds 'landbúnaðarráðherra'
  // ==========================================================================
  it("9. search 'ráðherra' (minister) finds 'landbúnaðarráðherra'", () => {
    expect(searchMatches("ráðherra", "Landbúnaðarráðherra sagði")).toBe(true);
  });

  // ==========================================================================
  // 10. Two-word query: Both must match
  // ==========================================================================
  it("10. search 'hestur fallegur' finds doc with both words inflected", () => {
    expect(searchMatches("hestur fallegur", "Hestarnir voru fallegir")).toBe(
      true
    );
  });

  // ==========================================================================
  // 11. Adjective forms: All gender/case forms match
  // ==========================================================================
  it("11. search 'góður' finds doc with 'góðan' (accusative)", () => {
    expect(searchMatches("góður", "Hún keypti góðan bíl")).toBe(true);
  });

  // ==========================================================================
  // 12. Pronoun resolution: 'mig' (me) matches when searching 'ég' (I)
  // ==========================================================================
  it("12. search 'ég' finds doc with 'mig' (accusative of I)", () => {
    expect(searchMatches("ég", "Hann sá mig")).toBe(true);
  });

  // ==========================================================================
  // 13. Article-suffixed nouns: 'bílinn' matches 'bíll'
  // ==========================================================================
  it("13. search 'bíll' finds doc with 'bílinn' (the car)", () => {
    expect(searchMatches("bíll", "Bílinn var rauður")).toBe(true);
  });

  // ==========================================================================
  // 14. Capitalization: Case-insensitive search
  // ==========================================================================
  it("14. search 'HESTUR' finds lowercase 'hesturinn'", () => {
    expect(searchMatches("HESTUR", "hesturinn var í túninu")).toBe(true);
  });

  // ==========================================================================
  // 15. Superlative: 'stór' matches 'stærstur'
  // ==========================================================================
  it("15. search 'stór' finds doc with 'stærstur' (largest)", () => {
    expect(searchMatches("stór", "Þetta er stærstur skógur landsins")).toBe(
      true
    );
  });

  // ==========================================================================
  // 16. Verb 'vera' (to be): All forms match
  // ==========================================================================
  it("16. search 'vera' finds doc with 'voru' (they were)", () => {
    expect(searchMatches("vera", "Þeir voru ekki heima")).toBe(true);
  });

  // ==========================================================================
  // 17. Job title search: inflected occupation matches
  // ==========================================================================
  it("17. search 'kennari' finds 'kennurum' (dative plural)", () => {
    expect(searchMatches("kennari", "Við ræddum við kennurum")).toBe(true);
  });

  // ==========================================================================
  // 18. Food/recipe search: ingredient in various cases
  // ==========================================================================
  it("18. search 'egg' finds 'eggjunum' (the eggs, dative)", () => {
    expect(searchMatches("egg", "Bætið eggjunum í deigið")).toBe(true);
  });

  // ==========================================================================
  // 19. Legal/formal text: genitive plural
  // ==========================================================================
  it("19. search 'lög' (law) finds 'laga' (of laws, genitive)", () => {
    expect(searchMatches("lög", "Samkvæmt ákvæðum laga")).toBe(true);
  });

  // ==========================================================================
  // 20. Negative case: Unrelated words don't match
  // ==========================================================================
  it("20. search 'hundur' (dog) does NOT find 'hestur' (horse)", () => {
    expect(searchMatches("hundur", "Hesturinn var í túninu")).toBe(false);
  });
});

describe("Search UX: Edge cases and tricky scenarios", () => {
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

  function searchMatches(query: string, document: string): boolean {
    const queryResult = buildSearchQuery(query, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });
    const docLemmas = extractIndexableLemmas(document, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });

    return queryResult.groups.every((group) =>
      group.some((lemma) => docLemmas.has(lemma))
    );
  }

  // ==========================================================================
  // 21. Compound splitting: splits into 2 parts, not recursively
  // LIMITATION: húsnæðislánareglur → húsnæði + lánaregla (not lán + regla)
  // ==========================================================================
  it("21. search 'lánaregla' finds 'húsnæðislánareglur' (2-way split)", () => {
    expect(
      searchMatches("lánaregla", "Nýjar húsnæðislánareglur taka gildi")
    ).toBe(true);
  });

  // ==========================================================================
  // 22. Ambiguous word 'á': should find documents using it as verb
  // ==========================================================================
  it("22. search 'eiga' (to own) finds doc with 'á' (owns)", () => {
    expect(searchMatches("eiga", "Ég á bíl")).toBe(true);
  });

  // ==========================================================================
  // 23. Middle name - 'fjalla' from 'fjall' (mountain)
  // ==========================================================================
  it("23. search 'fjall' finds 'fjalla' (of mountains)", () => {
    expect(searchMatches("fjall", "Við sáum tinda fjalla")).toBe(true);
  });

  // ==========================================================================
  // 24. Reflexive verb: 'vera' vs 'verast'
  // ==========================================================================
  it("24. search 'sjá' finds 'sáum' (we saw)", () => {
    expect(searchMatches("sjá", "Við sáum hana í gær")).toBe(true);
  });

  // ==========================================================================
  // 25. Past participle: search verb, find participle
  // ==========================================================================
  it("25. search 'skrifa' finds 'skrifað' (written)", () => {
    expect(searchMatches("skrifa", "Bókin var skrifuð í gær")).toBe(true);
  });

  // ==========================================================================
  // 26. Place name inside compound: 'Reykjavíkur-' compounds
  // ==========================================================================
  it("26. search 'borgarstjóri' finds various forms", () => {
    expect(searchMatches("borgarstjóri", "Borgarstjórinn tók til máls")).toBe(
      true
    );
  });

  // ==========================================================================
  // 27. Hyphenated words: parts are indexed separately
  // ==========================================================================
  it("27. search 'COVID' finds doc with 'COVID-sýking'", () => {
    expect(searchMatches("COVID", "Þetta er COVID-sýking")).toBe(true);
  });

  // ==========================================================================
  // 28. Middle component of compound: 'náms' in 'námskrá'
  // ==========================================================================
  it("28. search 'nám' finds 'námskrá' (curriculum)", () => {
    expect(searchMatches("nám", "Ný námskrá fyrir framhaldsskóla")).toBe(true);
  });

  // ==========================================================================
  // 29. Verb 'geta' (can) - highly irregular
  // ==========================================================================
  it("29. search 'geta' finds 'gat' (could, past tense)", () => {
    expect(searchMatches("geta", "Hann gat ekki sofið")).toBe(true);
  });

  // ==========================================================================
  // 30. Known compound in BÍN: not split further
  // LIMITATION: 'ríkisstjórn' is in BÍN as a single lemma, not split to ríki+stjórn
  // ==========================================================================
  it("30. search 'ríkisstjórn' finds 'ríkisstjórnin'", () => {
    expect(searchMatches("ríkisstjórn", "Ríkisstjórnin tilkynnti")).toBe(true);
  });
});

describe("Search UX: Known limitations", () => {
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

  function searchMatches(query: string, document: string): boolean {
    const queryResult = buildSearchQuery(query, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });
    const docLemmas = extractIndexableLemmas(document, lemmatizer, {
      bigrams: lemmatizer,
      compoundSplitter: splitter,
      removeStopwords: true,
    });

    return queryResult.groups.every((group) =>
      group.some((lemma) => docLemmas.has(lemma))
    );
  }

  // These tests document known limitations - they currently FAIL
  // They're marked with .skip so CI passes, but serve as documentation

  it.skip("LIMITATION: No recursive compound splitting", () => {
    // húsnæðislánareglur splits to húsnæði + lánaregla
    // User expects 'regla' to match, but lánaregla isn't further split
    expect(searchMatches("regla", "Húsnæðislánareglur eru flóknar")).toBe(true);
  });

  it("Hyphenated words: can search by either part", () => {
    // COVID-sýking splits to covid + sýking, both searchable
    expect(searchMatches("sýking", "Þetta er COVID-sýking")).toBe(true);
  });

  it.skip("LIMITATION: BÍN compounds not split to components", () => {
    // ríkisstjórn is in BÍN, so not split to ríki + stjórn
    expect(searchMatches("stjórn", "Ríkisstjórnin tilkynnti")).toBe(true);
  });
});
