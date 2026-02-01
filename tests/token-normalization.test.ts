/**
 * Tests for token normalization - indexing non-word token types.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
  buildSearchQuery,
  normalizeToken,
} from "../src/index.js";
import { tokenize } from "tokenize-is";

describe("Token normalization for indexing", () => {
  let lemmatizer: BinaryLemmatizer;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
  });

  describe("normalizeToken function", () => {
    it("normalizes phone number token (7-digit)", () => {
      const tokens = tokenize("5551234");
      const telno = tokens.find((t) => t.kind === "telno");
      expect(telno).toBeDefined();
      expect(normalizeToken(telno!)).toEqual(["5551234"]);
    });

    it("normalizes phone number token with country code", () => {
      // tokenize-is requires dashes for international format
      const tokens = tokenize("+354-555-1234");
      const telno = tokens.find((t) => t.kind === "telno");
      expect(telno).toBeDefined();
      // Preserves + prefix for international numbers
      expect(normalizeToken(telno!)).toEqual(["+3545551234"]);
    });

    it("normalizes email token", () => {
      const tokens = tokenize("foo@bar.is");
      const email = tokens.find((t) => t.kind === "email");
      expect(email).toBeDefined();
      expect(normalizeToken(email!)).toEqual(["foo@bar.is"]);
    });

    it("normalizes URL token", () => {
      const tokens = tokenize("https://example.is/path");
      const url = tokens.find((t) => t.kind === "url");
      expect(url).toBeDefined();
      expect(normalizeToken(url!)).toEqual(["https://example.is/path"]);
    });

    it("normalizes domain token", () => {
      const tokens = tokenize("example.is");
      const domain = tokens.find((t) => t.kind === "domain");
      expect(domain).toBeDefined();
      expect(normalizeToken(domain!)).toEqual(["example.is"]);
    });

    it("normalizes time token", () => {
      const tokens = tokenize("14:30");
      const time = tokens.find((t) => t.kind === "time");
      expect(time).toBeDefined();
      expect(normalizeToken(time!)).toEqual(["14:30"]);
    });

    it("normalizes percent token", () => {
      const tokens = tokenize("25%");
      const percent = tokens.find((t) => t.kind === "percent");
      expect(percent).toBeDefined();
      // Keeps % suffix to distinguish from plain numbers
      expect(normalizeToken(percent!)).toEqual(["25%"]);
    });

    it("normalizes hashtag token", () => {
      const tokens = tokenize("#Iceland");
      const hashtag = tokens.find((t) => t.kind === "hashtag");
      expect(hashtag).toBeDefined();
      // Keeps # prefix so word searches don't match hashtags
      expect(normalizeToken(hashtag!)).toEqual(["#iceland"]);
    });

    it("normalizes username token", () => {
      const tokens = tokenize("@Jokull");
      const username = tokens.find((t) => t.kind === "username");
      expect(username).toBeDefined();
      // Keeps @ prefix so word searches don't match usernames
      expect(normalizeToken(username!)).toEqual(["@jokull"]);
    });

    it("normalizes number token", () => {
      const tokens = tokenize("42");
      const num = tokens.find((t) => t.kind === "number");
      expect(num).toBeDefined();
      expect(normalizeToken(num!)).toEqual(["42"]);
    });

    it("normalizes date token", () => {
      const tokens = tokenize("15.3.2024");
      const date = tokens.find((t) => t.kind === "date");
      expect(date).toBeDefined();
      expect(normalizeToken(date!)).toEqual(["2024-03-15"]);
    });

    it("normalizes measurement token", () => {
      const tokens = tokenize("15km");
      const measurement = tokens.find((t) => t.kind === "measurement");
      expect(measurement).toBeDefined();
      // tokenize-is normalizes km to m, combined as single token
      expect(normalizeToken(measurement!)).toEqual(["15 m"]);
    });

    it("normalizes amount token", () => {
      const tokens = tokenize("$100");
      const amount = tokens.find((t) => t.kind === "amount");
      expect(amount).toBeDefined();
      // Combined as single token for precise search matching
      expect(normalizeToken(amount!)).toEqual(["100 USD"]);
    });

    it("returns empty for word token", () => {
      const tokens = tokenize("hestur");
      const word = tokens.find((t) => t.kind === "word");
      expect(word).toBeDefined();
      expect(normalizeToken(word!)).toEqual([]);
    });

    it("returns empty for punctuation token", () => {
      const tokens = tokenize(".");
      const punct = tokens.find((t) => t.kind === "punctuation");
      expect(punct).toBeDefined();
      expect(normalizeToken(punct!)).toEqual([]);
    });
  });

  describe("phone numbers (telno)", () => {
    it("normalizes international phone number with + prefix", () => {
      const lemmas = extractIndexableLemmas("Ring +354-555-1234", lemmatizer);
      expect(lemmas.has("+3545551234")).toBe(true);
    });

    it("normalizes 7-digit Icelandic number", () => {
      const lemmas = extractIndexableLemmas("Sími 5551234", lemmatizer);
      expect(lemmas.has("5551234")).toBe(true);
    });
  });

  describe("email", () => {
    it("lowercases email", () => {
      const lemmas = extractIndexableLemmas("Email: Foo@Bar.IS", lemmatizer);
      expect(lemmas.has("foo@bar.is")).toBe(true);
    });

    it("handles email in sentence", () => {
      const lemmas = extractIndexableLemmas(
        "Sendu tölvupóst á info@example.is",
        lemmatizer
      );
      expect(lemmas.has("info@example.is")).toBe(true);
    });
  });

  describe("URLs and domains", () => {
    it("indexes URL as-is", () => {
      const lemmas = extractIndexableLemmas(
        "See https://example.is/path",
        lemmatizer
      );
      expect(lemmas.has("https://example.is/path")).toBe(true);
    });

    it("lowercases domain", () => {
      const lemmas = extractIndexableLemmas("Visit Example.IS", lemmatizer);
      expect(lemmas.has("example.is")).toBe(true);
    });
  });

  describe("dates", () => {
    it("normalizes European date format to ISO", () => {
      const lemmas = extractIndexableLemmas("Fundur 15.3.2024", lemmatizer);
      expect(lemmas.has("2024-03-15")).toBe(true);
    });

    it("normalizes ISO date", () => {
      const lemmas = extractIndexableLemmas("Dagsetning 2024-06-17", lemmatizer);
      expect(lemmas.has("2024-06-17")).toBe(true);
    });
  });

  describe("time", () => {
    it("normalizes time to HH:MM", () => {
      const lemmas = extractIndexableLemmas("Klukkan 14:30", lemmatizer);
      expect(lemmas.has("14:30")).toBe(true);
    });

    it("includes seconds when present", () => {
      const lemmas = extractIndexableLemmas("Tími 09:15:30", lemmatizer);
      expect(lemmas.has("09:15:30")).toBe(true);
    });
  });

  describe("timestamps", () => {
    it("normalizes full timestamp to ISO", () => {
      const lemmas = extractIndexableLemmas(
        "Log 2024-06-17T14:30:00",
        lemmatizer
      );
      expect(lemmas.has("2024-06-17T14:30:00")).toBe(true);
    });
  });

  describe("SSN (kennitala)", () => {
    it("normalizes with dash format", () => {
      const lemmas = extractIndexableLemmas("Kt. 010130-2989", lemmatizer);
      expect(lemmas.has("010130-2989")).toBe(true);
    });

    it("adds dash when input has none", () => {
      const lemmas = extractIndexableLemmas("Kennitala 0101302989", lemmatizer);
      expect(lemmas.has("010130-2989")).toBe(true);
    });
  });

  describe("amounts", () => {
    it("handles USD as combined token", () => {
      const lemmas = extractIndexableLemmas("Cost $100", lemmatizer);
      expect(lemmas.has("100 USD")).toBe(true);
    });

    it("handles EUR as combined token", () => {
      const lemmas = extractIndexableLemmas("Price €50", lemmatizer);
      expect(lemmas.has("50 EUR")).toBe(true);
    });

    it("indexes ISK amount as combined token", () => {
      const lemmas = extractIndexableLemmas("Verð 5000 kr", lemmatizer);
      expect(lemmas.has("5000 ISK")).toBe(true);
    });

    it("search query matches indexed amount", () => {
      // Both index and search produce same normalized form
      const indexed = extractIndexableLemmas("Kostar $100", lemmatizer);
      const { groups } = buildSearchQuery("$100", lemmatizer);
      const searchTerms = groups.flat();
      // Search term should match what was indexed
      expect(searchTerms.some((term) => indexed.has(term))).toBe(true);
    });
  });

  describe("measurements", () => {
    it("indexes as combined token", () => {
      const lemmas = extractIndexableLemmas("Lengd 15km", lemmatizer);
      // tokenize-is normalizes km to m, combined as single token
      expect(lemmas.has("15 m")).toBe(true);
    });

    it("handles weight measurement as combined token", () => {
      const lemmas = extractIndexableLemmas("Þyngd 2,5kg", lemmatizer);
      expect(lemmas.has("2.5 kg") || lemmas.has("2.5 g")).toBe(true);
    });

    it("search query matches indexed measurement", () => {
      const indexed = extractIndexableLemmas("Lengd 15km", lemmatizer);
      const { groups } = buildSearchQuery("15km", lemmatizer);
      const searchTerms = groups.flat();
      expect(searchTerms.some((term) => indexed.has(term))).toBe(true);
    });
  });

  describe("percent", () => {
    it("indexes percentage with % suffix", () => {
      const lemmas = extractIndexableLemmas("Afsláttur 25%", lemmatizer);
      expect(lemmas.has("25%")).toBe(true);
    });

    it("handles decimal percentage", () => {
      const lemmas = extractIndexableLemmas("Vextir 3,5%", lemmatizer);
      expect(lemmas.has("3.5%")).toBe(true);
    });
  });

  describe("hashtags", () => {
    it("keeps # prefix and lowercases", () => {
      const lemmas = extractIndexableLemmas("Trending #Iceland", lemmatizer);
      expect(lemmas.has("#iceland")).toBe(true);
      // Word search should NOT match hashtag
      expect(lemmas.has("iceland")).toBe(false);
    });

    it("handles multi-word hashtag", () => {
      const lemmas = extractIndexableLemmas("Post #VisitIceland", lemmatizer);
      expect(lemmas.has("#visiticeland")).toBe(true);
    });
  });

  describe("usernames", () => {
    it("keeps @ prefix and lowercases", () => {
      const lemmas = extractIndexableLemmas("Follow @Jokull", lemmatizer);
      expect(lemmas.has("@jokull")).toBe(true);
      // Word search should NOT match username
      expect(lemmas.has("jokull")).toBe(false);
    });

    it("handles username in sentence", () => {
      const lemmas = extractIndexableLemmas(
        "Sendu skilaboð til @someone",
        lemmatizer
      );
      expect(lemmas.has("@someone")).toBe(true);
    });
  });

  describe("numbers (with includeNumbers)", () => {
    it("indexes number when includeNumbers is true", () => {
      const lemmas = extractIndexableLemmas("Síða 42", lemmatizer, {
        includeNumbers: true,
      });
      expect(lemmas.has("42")).toBe(true);
    });

    it("skips number when includeNumbers is false", () => {
      const lemmas = extractIndexableLemmas("Síða 42", lemmatizer, {
        includeNumbers: false,
      });
      expect(lemmas.has("42")).toBe(false);
    });
  });

  describe("buildSearchQuery includes normalized tokens", () => {
    it("can search for phone number", () => {
      const { query } = buildSearchQuery("+354-555-1234", lemmatizer);
      expect(query).toContain("+3545551234");
    });

    it("can search for email", () => {
      const { query } = buildSearchQuery("foo@bar.is", lemmatizer);
      expect(query).toContain("foo@bar.is");
    });

    it("can search for date", () => {
      const { query } = buildSearchQuery("15.3.2024", lemmatizer);
      expect(query).toContain("2024-03-15");
    });

    it("can search for hashtag with # prefix", () => {
      const { query } = buildSearchQuery("#Iceland", lemmatizer);
      expect(query).toContain("#iceland");
    });

    it("can search for URL", () => {
      const { query } = buildSearchQuery("https://example.is", lemmatizer);
      expect(query).toContain("https://example.is");
    });
  });

  describe("mixed content indexing", () => {
    it("indexes both words and special tokens", () => {
      const lemmas = extractIndexableLemmas(
        "Hringdu í 5551234 eða sendu tölvupóst á info@test.is",
        lemmatizer
      );

      // Words should be lemmatized
      expect(lemmas.has("hringja")).toBe(true); // hringdu
      expect(lemmas.has("senda")).toBe(true); // sendu
      expect(lemmas.has("tölvupóstur")).toBe(true);

      // Special tokens should be normalized with type indicators
      expect(lemmas.has("5551234")).toBe(true);
      expect(lemmas.has("info@test.is")).toBe(true);
    });

    it("indexes contact info in business listing", () => {
      const lemmas = extractIndexableLemmas(
        "Veitingastaður - Sími: +354-555-1234, netfang: info@restaurant.is, vefsíða: https://restaurant.is",
        lemmatizer
      );

      expect(lemmas.has("veitingastaður")).toBe(true);
      expect(lemmas.has("+3545551234")).toBe(true); // with + prefix
      expect(lemmas.has("info@restaurant.is")).toBe(true);
      expect(lemmas.has("https://restaurant.is")).toBe(true);
    });

    it("indexes event with date and time", () => {
      const lemmas = extractIndexableLemmas(
        "Tónleikar 15.3.2024 kl. 20:00",
        lemmatizer
      );

      expect(lemmas.has("tónleikar")).toBe(true);
      expect(lemmas.has("2024-03-15")).toBe(true);
      expect(lemmas.has("20:00")).toBe(true);
    });

    it("indexes financial data with percentage", () => {
      const lemmas = extractIndexableLemmas(
        "Hagnaður $500 eða 15%",
        lemmatizer
      );

      expect(lemmas.has("hagnaður")).toBe(true);
      expect(lemmas.has("500 USD")).toBe(true); // combined amount
      expect(lemmas.has("15%")).toBe(true); // with % suffix
    });
  });
});
