import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  processText,
  applySubjectVerbRule,
  applyPrepositionRule,
  applyPronounVerbRule,
  inferCaseFromSuffix,
} from "../src/index.js";

let lem: BinaryLemmatizer;
let fullLem: BinaryLemmatizer;

beforeAll(() => {
  const binPath = join(import.meta.dirname, "../data-dist/lemma-is.core.bin");
  const buf = readFileSync(binPath);
  lem = BinaryLemmatizer.loadFromBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
  const fullPath = join(import.meta.dirname, "../data-dist/lemma-is.bin");
  const fullBuf = readFileSync(fullPath);
  fullLem = BinaryLemmatizer.loadFromBuffer(
    fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength)
  );
});

/** Helper: get disambiguated lemma for "á" in a sentence */
function getDisambiguatedA(text: string): string[] {
  const tokens = processText(text, lem, { bigrams: lem });
  return tokens
    .filter((t) => t.original.toLowerCase() === "á")
    .map((t) => t.disambiguated ?? t.lemmas.join(","));
}

describe("inferCaseFromSuffix", () => {
  it("detects dative definite suffixes", () => {
    expect(inferCaseFromSuffix("borðinu").has("þgf")).toBe(true);
    expect(inferCaseFromSuffix("þakinu").has("þgf")).toBe(true);
    expect(inferCaseFromSuffix("hestinum").has("þgf")).toBe(true);
    expect(inferCaseFromSuffix("hestunum").has("þgf")).toBe(true);
  });

  it("detects nominative/accusative definite suffixes", () => {
    const cases = inferCaseFromSuffix("hestinn");
    expect(cases.has("nf")).toBe(true);
    expect(cases.has("þf")).toBe(true);
  });

  it("detects dative but not accusative for -inu/-inum words", () => {
    const cases = inferCaseFromSuffix("borðinu");
    expect(cases.has("þgf")).toBe(true);
    expect(cases.has("þf")).toBe(false);
  });

  it("returns empty for bare nouns", () => {
    expect(inferCaseFromSuffix("pabbi").size).toBe(0);
    expect(inferCaseFromSuffix("konráð").size).toBe(0);
  });
});

describe("á disambiguation — verb eiga vs preposition", () => {
  describe("pronoun subjects → eiga (verb)", () => {
    it("ég á hund", () => {
      expect(getDisambiguatedA("Ég á hund")).toEqual(["eiga"]);
    });

    it("hann á bílinn", () => {
      expect(getDisambiguatedA("Hann á bílinn")).toEqual(["eiga"]);
    });

    it("hún á hús á landinu — first á is verb, second is preposition", () => {
      expect(getDisambiguatedA("Hún á hús á landinu")).toEqual(["eiga", "á"]);
    });
  });

  describe("noun/name subjects → eiga (verb)", () => {
    it("barnið á leikfangið — definite noun subject", () => {
      expect(getDisambiguatedA("Barnið á leikfangið")).toEqual(["eiga"]);
    });

    it("kötturinn á leikfangið — definite noun subject", () => {
      expect(getDisambiguatedA("Kötturinn á leikfangið")).toEqual(["eiga"]);
    });

    it("konráð á buxurnar — proper name subject", () => {
      expect(getDisambiguatedA("Konráð á buxurnar")).toEqual(["eiga"]);
    });

    it("jón á þrjá hesta — proper name + numeral + noun", () => {
      expect(getDisambiguatedA("Jón á þrjá hesta")).toEqual(["eiga"]);
    });

    it("pabbi á stóran bát — bare noun + adjective + noun", () => {
      expect(getDisambiguatedA("Pabbi á stóran bát")).toEqual(["eiga"]);
    });
  });

  describe("preposition á — location/direction", () => {
    it("bókin er á borðinu — dative location", () => {
      expect(getDisambiguatedA("Bókin er á borðinu")).toEqual(["á"]);
    });

    it("kötturinn sat á þakinu — dative location", () => {
      expect(getDisambiguatedA("Kötturinn sat á þakinu")).toEqual(["á"]);
    });

    it("þau búa á akureyri — preposition with place name", () => {
      expect(getDisambiguatedA("Þau búa á Akureyri")).toEqual(["á"]);
    });

    it("ég fer á fjallið — preposition with accusative direction", () => {
      expect(getDisambiguatedA("Ég fer á fjallið")).toEqual(["á"]);
    });

    it("á morgun fer ég í vinnuna — á morgun is prepositional phrase", () => {
      expect(getDisambiguatedA("Á morgun fer ég í vinnuna")).toEqual(["á"]);
    });
  });

  describe("full model — issue #12 (pronoun subjects → eiga)", () => {
    /** Get the disambiguated lemma of "á" in a sentence (full model). */
    function getA(text: string): string[] {
      const tokens = processText(text, fullLem, { bigrams: fullLem });
      return tokens
        .filter((t) => t.original.toLowerCase() === "á")
        .map((t) => t.disambiguated ?? t.lemmas.join(","));
    }

    it("Ég á bíl — pronoun subject, accusative object", () => {
      expect(getA("Ég á bíl")).toEqual(["eiga"]);
    });

    it("Ég á bílinn — definite accusative object", () => {
      expect(getA("Ég á bílinn")).toEqual(["eiga"]);
    });

    it("Ég á hest / Hann á hest / hann á bíl — pronoun subjects", () => {
      expect(getA("Ég á hest")).toEqual(["eiga"]);
      expect(getA("Hann á hest")).toEqual(["eiga"]);
      expect(getA("hann á bíl")).toEqual(["eiga"]);
    });

    it("Hún á hest — pronoun subject without noun homograph dependency", () => {
      expect(getA("Hún á hest")).toEqual(["eiga"]);
    });

    it("Ég á ekki / Hann á ekki — pronoun + á + negation", () => {
      expect(getA("Ég á ekki")).toEqual(["eiga"]);
      expect(getA("Hann á ekki")).toEqual(["eiga"]);
    });

    it("Ég fer á fjallið — verb-dominant prev word is not a subject", () => {
      expect(getA("Ég fer á fjallið")).toEqual(["á"]);
    });

    it("þau búa á akureyri — verb-dominant prev word is not a subject", () => {
      expect(getA("Þau búa á Akureyri")).toEqual(["á"]);
    });

    it("preposition rows stay preposition", () => {
      expect(getA("Bókin er á borðinu")).toEqual(["á"]);
      expect(getA("Strákarnir á Íslandi")).toEqual(["á"]);
      expect(getA("Á morgun fer ég í vinnuna")).toEqual(["á"]);
    });

    it("Hún á hús á landinu — first á verb, second preposition", () => {
      expect(getA("Hún á hús á landinu")).toEqual(["eiga", "á"]);
    });
  });
});
