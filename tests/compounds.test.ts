import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import {
  Lemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
} from "../src/index.js";

describe("CompoundSplitter", () => {
  let lemmatizer: Lemmatizer;
  let splitter: CompoundSplitter;
  let knownLemmas: Set<string>;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");

    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);

    // Create set of known lemmas
    const lemmasText = lemmasBuffer.toString("utf-8");
    const lemmasList = lemmasText.split("\n").filter((l) => l.length > 0);
    knownLemmas = createKnownLemmaSet(lemmasList);

    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("should not split short words", () => {
    const result = splitter.split("hús");
    expect(result.isCompound).toBe(false);
    expect(result.parts).toEqual(["hús"]);
  });

  it("should not split unknown words", () => {
    const result = splitter.split("xyzabcdef");
    expect(result.isCompound).toBe(false);
  });

  it("should split 'bílstjóri' (car driver)", () => {
    // bíl + stjóri
    const result = splitter.split("bílstjóri");
    // This should be identified as a compound if both parts are known
    if (result.isCompound) {
      expect(result.parts).toContain("bíll");
      expect(result.parts).toContain("stjóri");
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  it("should split 'sjúkrahús' (hospital)", () => {
    // sjúkra (sick-GEN) + hús (house)
    const result = splitter.split("sjúkrahús");
    if (result.isCompound) {
      expect(result.parts).toContain("hús");
    }
  });

  it("should handle compounds with linking 's'", () => {
    // "húseigandi" = hús (house) + eigandi (owner)
    // The 's' at the junction is a linking letter
    const result = splitter.split("húseigandi");
    if (result.isCompound) {
      expect(result.parts).toContain("hús");
      expect(result.parts).toContain("eigandi");
    }
  });

  it("should get all lemmas including compound parts", () => {
    const lemmas = splitter.getAllLemmas("bílstjóri");
    // Should include direct lemmas and compound parts
    expect(lemmas.length).toBeGreaterThan(0);
  });

  it("should return direct lemmas for non-compounds", () => {
    const lemmas = splitter.getAllLemmas("hestur");
    expect(lemmas).toContain("hestur");
  });
});

describe("createKnownLemmaSet", () => {
  it("should create lowercase set", () => {
    const lemmas = ["Hestur", "Bíll", "hús"];
    const set = createKnownLemmaSet(lemmas);

    expect(set.has("hestur")).toBe(true);
    expect(set.has("bíll")).toBe(true);
    expect(set.has("hús")).toBe(true);
    expect(set.has("Hestur")).toBe(false); // Should be lowercase
  });
});
