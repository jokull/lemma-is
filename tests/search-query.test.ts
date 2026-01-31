import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
  buildSearchQuery,
} from "../src/index.js";

describe("buildSearchQuery", () => {
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

  it("normalizes inflected queries to lemmas", () => {
    const { groups, query } = buildSearchQuery("bílaleigur", lemmatizer, {
      removeStopwords: true,
    });

    expect(groups.length).toBe(1);
    expect(groups[0]).toContain("bílaleiga");
    expect(query).toContain("bílaleiga");
  });

  it("builds AND/OR groups with custom operators", () => {
    const result = buildSearchQuery("á bílaleigur", lemmatizer, {
      removeStopwords: false,
      andOperator: " AND ",
      orOperator: " OR ",
    });

    expect(result.query.includes(" AND ")).toBe(true);
    expect(result.query.includes(" OR ")).toBe(true);
    expect(result.query).toContain("bílaleiga");
  });

  it("can include original token as fallback", () => {
    const result = buildSearchQuery("bílaleigur", lemmatizer, {
      includeOriginal: true,
    });

    expect(result.groups[0]).toContain("bílaleigur");
    expect(result.groups[0]).toContain("bílaleiga");
  });

  it("can use disambiguated-only mode", () => {
    const result = buildSearchQuery("á", lemmatizer, {
      indexAllCandidates: false,
    });

    expect(result.groups.length).toBe(1);
    expect(result.groups[0].length).toBe(1);
  });

  it("respects compound splitting", () => {
    const result = buildSearchQuery("húsnæðislánareglur", lemmatizer, {
      compoundSplitter: splitter,
    });

    expect(result.query.length).toBeGreaterThan(0);
  });
});
