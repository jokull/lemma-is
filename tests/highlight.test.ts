import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { BinaryLemmatizer, highlight, extractSnippets } from "../src/index.js";

describe("highlight", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const buffer = readFileSync("data-dist/lemma-is.core.bin");
    lemmatizer = new BinaryLemmatizer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  describe("basic highlighting", () => {
    it("should highlight exact matches", () => {
      const result = highlight("hestur", "Hestur er dýr.", lemmatizer);
      expect(result.matchCount).toBe(1);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({ text: "Hestur", highlight: true });
      expect(result.segments[1]).toEqual({ text: " er dýr.", highlight: false });
    });

    it("should highlight inflected forms", () => {
      const result = highlight("hestur", "Hestarnir eru á beitinni.", lemmatizer);
      expect(result.matchCount).toBe(1);
      expect(result.segments[0]).toEqual({ text: "Hestarnir", highlight: true });
    });

    it("should highlight multiple matches", () => {
      const result = highlight("hestur", "Hesturinn og hestarnir.", lemmatizer);
      expect(result.matchCount).toBe(2);
      const highlighted = result.segments.filter((s) => s.highlight);
      expect(highlighted).toHaveLength(2);
      expect(highlighted[0].text).toBe("Hesturinn");
      expect(highlighted[1].text).toBe("hestarnir");
    });

    it("should return single segment when no matches", () => {
      const result = highlight("köttur", "Hundurinn hljóp.", lemmatizer);
      expect(result.matchCount).toBe(0);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].highlight).toBe(false);
    });

    it("should handle empty query", () => {
      const result = highlight("", "Texti hér.", lemmatizer);
      expect(result.matchCount).toBe(0);
      expect(result.segments).toHaveLength(1);
    });

    it("should handle multi-word queries", () => {
      const result = highlight("hestur gras", "Hestarnir borða gras.", lemmatizer);
      expect(result.matchCount).toBe(2);
      const highlighted = result.segments.filter((s) => s.highlight);
      expect(highlighted.map((s) => s.text)).toContain("Hestarnir");
      expect(highlighted.map((s) => s.text)).toContain("gras");
    });
  });

  describe("verb inflection matching", () => {
    it("should match verb conjugations", () => {
      const result = highlight("fara", "Við fórum í bíó.", lemmatizer);
      expect(result.matchCount).toBe(1);
      expect(result.segments.find((s) => s.highlight)?.text).toBe("fórum");
    });
  });

  describe("edge cases", () => {
    it("should handle match at document start", () => {
      const result = highlight("maður", "Maðurinn gekk.", lemmatizer);
      expect(result.segments[0]).toEqual({ text: "Maðurinn", highlight: true });
    });

    it("should handle match at document end", () => {
      const result = highlight("maður", "Þar var maður", lemmatizer);
      const last = result.segments[result.segments.length - 1];
      expect(last.text).toBe("maður");
      expect(last.highlight).toBe(true);
    });

    it("should preserve whitespace between segments", () => {
      const result = highlight("hestur", "Hesturinn   hljóp.", lemmatizer);
      const fullText = result.segments.map((s) => s.text).join("");
      expect(fullText).toBe("Hesturinn   hljóp.");
    });
  });
});

describe("extractSnippets", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const buffer = readFileSync("data-dist/lemma-is.core.bin");
    lemmatizer = new BinaryLemmatizer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  describe("basic snippet extraction", () => {
    it("should extract snippet around match", () => {
      const doc = "Langt áður fyrr bjó maður á bæ. Hestarnir voru margir.";
      const result = extractSnippets("hestur", doc, lemmatizer);

      expect(result.totalMatches).toBe(1);
      expect(result.snippets).toHaveLength(1);
      expect(result.snippets[0].text).toContain("Hestarnir");
    });

    it("should return empty for no matches", () => {
      const result = extractSnippets("köttur", "Hundurinn hljóp.", lemmatizer);
      expect(result.totalMatches).toBe(0);
      expect(result.snippets).toHaveLength(0);
    });

    it("should include ellipsis for truncated snippets", () => {
      const doc = "Upphaf. " + "Orð ".repeat(20) + "Hesturinn var hér. " + "Orð ".repeat(20) + "Endir.";
      const result = extractSnippets("hestur", doc, lemmatizer, { snippetWords: 8 });

      expect(result.snippets[0].text).toContain("…");
    });

    it("should not include leading ellipsis at document start", () => {
      const doc = "Hesturinn var hér.";
      const result = extractSnippets("hestur", doc, lemmatizer);

      expect(result.snippets[0].text).not.toMatch(/^…/);
    });
  });

  describe("multiple snippets", () => {
    it("should extract multiple non-overlapping snippets", () => {
      const doc = `Hestarnir voru margir. ${"Orð ".repeat(30)} Hesturinn var þreyttur.`;
      const result = extractSnippets("hestur", doc, lemmatizer, {
        snippetWords: 6,
        maxSnippets: 3
      });

      expect(result.totalMatches).toBe(2);
      expect(result.snippets.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect maxSnippets limit", () => {
      const doc = `Hestur eitt. ${"Orð ".repeat(20)} Hestur tvö. ${"Orð ".repeat(20)} Hestur þrjú.`;
      const result = extractSnippets("hestur", doc, lemmatizer, {
        snippetWords: 5,
        maxSnippets: 2
      });

      expect(result.snippets.length).toBeLessThanOrEqual(2);
    });
  });

  describe("snippet scoring", () => {
    it("should select higher-scoring snippets", () => {
      // Two regions with matches - one with 2 matches, one with 1
      const doc = `Hesturinn einn. ${"Orð ".repeat(30)} Hesturinn og hestarnir saman.`;
      const result = extractSnippets("hestur", doc, lemmatizer, {
        snippetWords: 8,
        maxSnippets: 1  // Only get the best one
      });

      // The snippet with 2 matches (hesturinn + hestarnir) should be selected
      expect(result.snippets).toHaveLength(1);
      expect(result.snippets[0].text).toContain("hestarnir");
    });
  });

  describe("options", () => {
    it("should respect custom ellipsis", () => {
      const doc = "Upphaf. " + "Orð ".repeat(20) + "Hesturinn var hér.";
      const result = extractSnippets("hestur", doc, lemmatizer, {
        snippetWords: 6,
        ellipsis: "..."
      });

      expect(result.snippets[0].text).toContain("...");
    });

    it("should include segments for custom rendering", () => {
      const result = extractSnippets("hestur", "Hestarnir voru góðir.", lemmatizer);

      expect(result.snippets[0].segments).toBeDefined();
      expect(result.snippets[0].segments.length).toBeGreaterThan(0);

      const highlighted = result.snippets[0].segments.find((s) => s.highlight);
      expect(highlighted?.text).toBe("Hestarnir");
    });

    it("should include character offsets", () => {
      const doc = "Upphaf. Hesturinn hér.";
      const result = extractSnippets("hestur", doc, lemmatizer);

      expect(result.snippets[0].start).toBeGreaterThanOrEqual(0);
      expect(result.snippets[0].end).toBeGreaterThan(result.snippets[0].start);
      expect(result.snippets[0].end).toBeLessThanOrEqual(doc.length);
    });
  });
});
