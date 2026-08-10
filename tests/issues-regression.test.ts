/**
 * Regression tests for the GitHub issues (jokull/lemma-is#2–#10).
 *
 * Each test pins a verified behavior: cross-checked against the BÍN catalog
 * (SHsnid.csv) and GreynirEngine before the fix was applied.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
  buildSearchQuery,
  isStopword,
} from "../src/index.js";

describe("Issue regressions", () => {
  let core: BinaryLemmatizer;
  let full: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const load = (name: string) => {
      const buffer = readFileSync(join(dataDir, name));
      return BinaryLemmatizer.loadFromBuffer(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      );
    };
    core = load("lemma-is.core.bin");
    full = load("lemma-is.bin");
  });

  describe("#5: lemmatize() returns no lemmas for non-word tokens", () => {
    it("whitespace and punctuation yield []", () => {
      expect(core.lemmatize("   ")).toEqual([]);
      expect(core.lemmatize("!!")).toEqual([]);
      expect(core.lemmatize("…")).toEqual([]);
      expect(full.lemmatize("!!")).toEqual([]);
    });

    it("digit tokens still pass through", () => {
      expect(core.lemmatize("2026-08-10")).toEqual(["2026-08-10"]);
    });
  });

  describe("#10/#6: unknown inflected forms resolve via stem fallback", () => {
    // Verified against BÍN: these word forms are absent from SHsnid.csv
    // (or below the core model's top-350k cutoff), but their stripped stems
    // are real dictionary forms with the expected lemmas.
    it.each([
      ["brandinn", "brandur"], // acc.sg.def of brandur (core gap)
      ["brandinum", "brandur"], // dat.sg.def of brandur (core gap)
      ["sveininn", "sveinn"], // core gap
      ["pizzunni", "pizza"], // dat.sg.def, core gap
      ["kreditkortsins", "kreditkort"], // core gap
      ["skógs", "skógur"], // gen.sg (not in BÍN)
      ["brandir", "brandur"], // nom.pl (BÍN lists brandar; brandir is a form of brandr)
      ["kýrnanna", "kýr"], // gen.pl.def (BÍN lists kúnna)
      ["vinsins", "vinur"], // gen.sg.def (BÍN lists vinarins)
      ["óxum", "vaxa"], // past 1pl (BÍN lists only óx)
      ["óxu", "vaxa"], // past 3pl (BÍN lists only óx)
    ])("lemmatize(%s) includes %s", (form, lemma) => {
      expect(core.lemmatize(form)).toContain(lemma);
      expect(full.lemmatize(form)).toContain(lemma);
    });

    it("lemmatize('lýsnar') includes lús (full model)", () => {
      expect(full.lemmatize("lýsnar")).toContain("lús");
    });

    it("never returns the stripped string itself as a lemma", () => {
      // The fallback only returns real dictionary lemmas.
      const result = core.lemmatize("skógs");
      expect(result).not.toContain("skóg");
      expect(result).toContain("skógur");
    });
  });

  describe("#3: definite forms of skóli resolve to skóli", () => {
    it.each(["skólinn", "skólann", "skólanum", "skólans"])(
      "lemmatize(%s) → skóli (proper-noun Skólinn no longer its own lemma)",
      (form) => {
        expect(full.lemmatize(form)).toEqual(["skóli"]);
        expect(core.lemmatize(form)).toEqual(["skóli"]);
      }
    );
  });

  describe("#7: verb readings preserved for homographic past forms", () => {
    // BÍN-verified: "óxum"/"óxu" are absent from BÍN (only "óx" is listed),
    // so the stem fallback recovers vaxa. "þágu" is a real BÍN form of þiggja.
    it("lemmatize('þágu') includes þiggja", () => {
      expect(core.lemmatize("þágu")).toContain("þiggja");
    });
  });

  describe("#8: stopword filtering is robust to lemmatization", () => {
    it("ekki and var are stopwords", () => {
      expect(isStopword("ekki")).toBe(true);
      expect(isStopword("var")).toBe(true);
    });

    it("a stopwords-only sentence indexes nothing", () => {
      const sentence =
        "og er að í ekki sem það hann var ég við þau hún um fyrir með á úr til en eða";
      const lemmas = extractIndexableLemmas(sentence, core, {
        removeStopwords: true,
      });
      expect([...lemmas]).toEqual([]);
      expect(
        buildSearchQuery(sentence, core, { removeStopwords: true }).query
      ).toBe("");
    });

    it("lemmatization escapes are caught (er→vera, sem→semja, á→eiga)", () => {
      const lemmas = extractIndexableLemmas("er sem á", core, {
        removeStopwords: true,
      });
      expect([...lemmas]).toEqual([]);
    });
  });

  describe("#9: tokenizer hygiene", () => {
    it("standalone % is never indexed", () => {
      expect([...extractIndexableLemmas("10.5%", core)]).toEqual([]);
      expect([...extractIndexableLemmas("%", core)]).toEqual([]);
    });

    it("hyphenated/colon numerics behave like plain numbers (dropped by default)", () => {
      expect([...extractIndexableLemmas("2026-08-10", core)]).toEqual([]);
      expect([...extractIndexableLemmas("12:30", core)]).toEqual([]);
      expect([...extractIndexableLemmas("123", core)]).toEqual([]);
    });

    it("dates are indexable with includeNumbers", () => {
      expect(
        [...extractIndexableLemmas("2026-08-10", core, { includeNumbers: true })]
      ).toEqual(["2026-08-10"]);
    });

    it("URLs and emails are not indexed as opaque blobs by default", () => {
      expect([...extractIndexableLemmas("https://example.com", core)]).toEqual(
        []
      );
      expect([...extractIndexableLemmas("jokull@solberg.is", core)]).toEqual([]);
    });

    it("hyphen-joined repeated inflected forms decompose like space-separated", () => {
      expect([...extractIndexableLemmas("börnin-börnin", core)]).toEqual([
        "barn",
      ]);
      expect([...extractIndexableLemmas("börnin börnin", core)]).toEqual([
        "barn",
      ]);
    });
  });
});
