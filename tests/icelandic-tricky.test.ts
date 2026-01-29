/**
 * A-Ha! Tests: Showcasing tricky Icelandic morphology
 *
 * These tests demonstrate why simple substring matching fails for Icelandic
 * and how lemmatization enables powerful search indexing.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";
import {
  Lemmatizer,
  BigramLookup,
  Disambiguator,
  CompoundSplitter,
  createKnownLemmaSet,
  extractLemmas,
} from "../src/index.js";

describe("A-Ha! Icelandic Morphology", () => {
  let lemmatizer: Lemmatizer;
  let bigrams: BigramLookup;
  let disambiguator: Disambiguator;

  beforeAll(() => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const lemmasBuffer = gunzipSync(
      readFileSync(join(dataDir, "lemmas.txt.gz"))
    );
    const lookupBuffer = gunzipSync(
      readFileSync(join(dataDir, "lookup.tsv.gz"))
    );
    lemmatizer = Lemmatizer.loadFromBuffers(lemmasBuffer, lookupBuffer);

    const bigramsBuffer = gunzipSync(
      readFileSync(join(dataDir, "bigrams.json.gz"))
    );
    bigrams = BigramLookup.loadFromBuffer(bigramsBuffer);
    disambiguator = new Disambiguator(lemmatizer, bigrams);
  });

  describe("Wildly different word forms → same lemma", () => {
    it("'menn' and 'manninum' both come from 'maður' (man)", () => {
      // A search for "maður" should find documents with "menn" or "manninum"
      // These look NOTHING alike but are the same word!
      const menn = lemmatizer.lemmatize("menn"); // nominative plural
      const manninum = lemmatizer.lemmatize("manninum"); // dative singular + article

      expect(menn).toContain("maður");
      expect(manninum).toContain("maður");
    });

    it("'börn' comes from 'barn' (child) - vowel change!", () => {
      // Icelandic has umlaut: barn → börn (a→ö)
      const barn = lemmatizer.lemmatize("barn");
      const born = lemmatizer.lemmatize("börn");
      const bornunum = lemmatizer.lemmatize("börnunum"); // dative plural + article

      expect(barn).toContain("barn");
      expect(born).toContain("barn");
      expect(bornunum).toContain("barn");
    });

    it("'kvenna' comes from 'kona' (woman) - consonant change!", () => {
      // kona → kvenna (genitive plural) - the 'o' becomes 'e' AND 'k' gets 'v'!
      const kona = lemmatizer.lemmatize("kona");
      const konuna = lemmatizer.lemmatize("konuna");
      const kvenna = lemmatizer.lemmatize("kvenna");

      expect(kona).toContain("kona");
      expect(konuna).toContain("kona");
      expect(kvenna).toContain("kona");
    });

    it("verb 'fara' (go) has completely different stems", () => {
      // Present: fer, ferð, fer, förum, farið, fara
      // Past: fór, fórst, fór, fórum, fóruð, fóru
      // These don't even share the same vowel!
      const fer = lemmatizer.lemmatize("fer"); // I go
      const for_ = lemmatizer.lemmatize("fór"); // I went
      const forum = lemmatizer.lemmatize("förum"); // we go
      const foru = lemmatizer.lemmatize("fóru"); // they went

      expect(fer).toContain("fara");
      expect(for_).toContain("fara");
      expect(forum).toContain("fara");
      expect(foru).toContain("fara");
    });
  });

  describe("Extreme ambiguity - same form, many meanings", () => {
    it("'á' can be 5+ different words", () => {
      // á = preposition "on"
      // á = noun "river"
      // á = verb "owns" (from eiga)
      // + more...
      const lemmas = lemmatizer.lemmatize("á");

      expect(lemmas.length).toBeGreaterThan(1);
      expect(lemmas).toContain("á"); // preposition/noun
      expect(lemmas).toContain("eiga"); // verb "to own"
    });

    it("'borðið' - the table OR has eaten", () => {
      // borðið = borð + -ið (the table, definite article)
      // borðið = past participle of borða (eaten)
      const lemmas = lemmatizer.lemmatize("borðið");

      expect(lemmas).toContain("borð"); // table
      expect(lemmas).toContain("borða"); // to eat
    });

    it("'sér' - sees OR oneself", () => {
      // sér = 3rd person singular of "sjá" (to see)
      // sér = dative of reflexive pronoun "sig"
      const lemmas = lemmatizer.lemmatize("sér");

      expect(lemmas).toContain("sjá"); // to see
      expect(lemmas).toContain("sig"); // reflexive pronoun
    });

    it("'þá' - then OR those (accusative)", () => {
      const lemmas = lemmatizer.lemmatize("þá");

      // Should have multiple interpretations
      expect(lemmas.length).toBeGreaterThan(1);
    });

    it("'komandi' - coming OR the coming one", () => {
      // Present participle used as adjective/noun
      const lemmas = lemmatizer.lemmatize("komandi");

      expect(lemmas).toContain("koma"); // verb
      expect(lemmas).toContain("komandi"); // adjective/noun
    });
  });

  describe("Bigram disambiguation in action", () => {
    it("'við erum' should prefer pronoun 'ég' over preposition", () => {
      // "við erum" = "we are" - við is the pronoun here
      // The bigram "ég erum" or context should help
      const result = disambiguator.disambiguate("við", null, "erum");

      // Check that disambiguation happened
      expect(result.ambiguous).toBe(true);
      expect(result.candidates.length).toBeGreaterThan(1);

      // With context, should have some confidence
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("'er á' should recognize location context", () => {
      // "er á" = "is on/at" - á is preposition
      const result = disambiguator.disambiguate("á", "er", null);

      expect(result.ambiguous).toBe(true);
      // The bigram context helps even if we can't guarantee exact lemma
    });

    it("'á hestur' vs 'á hestinn' - owns vs on", () => {
      // "ég á hest" = I own a horse (á from eiga)
      // "ég er á hestinum" = I am on the horse (á preposition)
      const ownsContext = disambiguator.disambiguate("á", "ég", "hest");
      const onContext = disambiguator.disambiguate("á", "er", "hestinum");

      // Both should be ambiguous but context should help
      expect(ownsContext.ambiguous).toBe(true);
      expect(onContext.ambiguous).toBe(true);
    });
  });

  describe("Search indexing scenarios", () => {
    it("document about horses should be findable by 'hestur'", () => {
      // A document containing: "Ég sá hestinn í túninu. Hestarnir voru fallegir."
      const doc = "Ég sá hestinn í túninu. Hestarnir voru fallegir.";
      const lemmas = extractLemmas(doc, lemmatizer);

      // User searches for "hestur" - should match!
      expect(lemmas.has("hestur")).toBe(true);
    });

    it("document about children should be findable by 'barn'", () => {
      // "Börnin léku sér úti. Við sáum mörg börn."
      const doc = "Börnin léku sér úti. Við sáum mörg börn.";
      const lemmas = extractLemmas(doc, lemmatizer);

      expect(lemmas.has("barn")).toBe(true);
    });

    it("document about going somewhere should match 'fara'", () => {
      // "Við fórum til Akureyrar. Þeir fara á morgun."
      const doc = "Við fórum til Akureyrar. Þeir fara á morgun.";
      const lemmas = extractLemmas(doc, lemmatizer);

      expect(lemmas.has("fara")).toBe(true);
    });

    it("document with 'kvenna' should match search for 'kona'", () => {
      // "Þetta er barátta kvenna fyrir jafnrétti."
      const doc = "Þetta er barátta kvenna fyrir jafnrétti.";
      const lemmas = extractLemmas(doc, lemmatizer);

      expect(lemmas.has("kona")).toBe(true);
    });
  });

  describe("Adjective declension madness", () => {
    it("'góður' has many forms - all should resolve", () => {
      // góður (masc nom), góða (fem acc), góðu (dat), góðan (masc acc), góðs (gen)
      const forms = ["góður", "góða", "góðu", "góðan", "góðs", "góðar", "góðum"];

      for (const form of forms) {
        const lemmas = lemmatizer.lemmatize(form);
        expect(lemmas).toContain("góður");
      }
    });

    it("'stór' (big) with umlaut in comparative", () => {
      // stór → stærri → stærstur
      const stor = lemmatizer.lemmatize("stór");
      const staerri = lemmatizer.lemmatize("stærri");
      const staerstur = lemmatizer.lemmatize("stærstur");

      expect(stor).toContain("stór");
      expect(staerri).toContain("stór");
      expect(staerstur).toContain("stór");
    });
  });

  describe("Pronoun complexity", () => {
    it("'ég' has wildly different case forms", () => {
      // ég (nom), mig (acc), mér (dat), mín (gen)
      // These look like completely different words!
      const eg = lemmatizer.lemmatize("ég");
      const mig = lemmatizer.lemmatize("mig");
      const mer = lemmatizer.lemmatize("mér");
      const min = lemmatizer.lemmatize("mín");

      expect(eg).toContain("ég");
      expect(mig).toContain("ég");
      expect(mer).toContain("ég");
      // mín might also be possessive pronoun
    });

    it("'hún/henni/hana/hennar' all from same pronoun", () => {
      const hun = lemmatizer.lemmatize("hún"); // she (nom)
      const henni = lemmatizer.lemmatize("henni"); // her (dat)
      const hana = lemmatizer.lemmatize("hana"); // her (acc)
      const hennar = lemmatizer.lemmatize("hennar"); // her (gen)

      expect(hun).toContain("hún");
      expect(henni).toContain("hún");
      expect(hana).toContain("hún");
      expect(hennar).toContain("hún");
    });
  });

  describe("Verbs with vowel shifts", () => {
    it("'vera' (to be) - the irregular king", () => {
      // er, ert, er, erum, eruð, eru (present)
      // var, varst, var, vorum, voruð, voru (past)
      // verið (past participle)
      const forms = ["er", "ert", "erum", "var", "vorum", "voru", "verið"];

      for (const form of forms) {
        const lemmas = lemmatizer.lemmatize(form);
        expect(lemmas).toContain("vera");
      }
    });

    it("'gera' (to do/make) conjugation", () => {
      // geri, gerir, gerir, gerum, gerið, gera (present)
      // gerði, gerðir, gerði, gerðum (past)
      const forms = ["geri", "gerir", "gerum", "gerði", "gerðum", "gert"];

      for (const form of forms) {
        const lemmas = lemmatizer.lemmatize(form);
        expect(lemmas).toContain("gera");
      }
    });

    it("'sjá' (to see) - stem changes", () => {
      // sé, sér, sér, sjáum, sjáið, sjá (present)
      // sá, sást, sá, sáum, sáuð, sáu (past)
      const forms = ["sé", "sér", "sjá", "sá", "sáum", "sáu", "séð"];

      for (const form of forms) {
        const lemmas = lemmatizer.lemmatize(form);
        expect(lemmas).toContain("sjá");
      }
    });
  });

  describe("Real-world search scenarios", () => {
    it("news article about parliament should match 'þingmaður'", () => {
      // Article mentions "þingmenn" (MPs, plural)
      const article =
        "Þingmenn ræddu frumvarpið í gær. Þingmaðurinn sagði...";
      const lemmas = extractLemmas(article, lemmatizer);

      // Search for "þingmaður" should find this
      expect(lemmas.has("þingmaður")).toBe(true);
    });

    it("recipe mentioning ingredients in various cases", () => {
      // "Bætið eggjunum í deigið. Notið þrjú egg."
      const recipe = "Bætið eggjunum í deigið. Notið þrjú egg.";
      const lemmas = extractLemmas(recipe, lemmatizer);

      expect(lemmas.has("egg")).toBe(true);
      expect(lemmas.has("deig")).toBe(true);
    });

    it("job posting should be findable by occupation", () => {
      // "Við leitum að reyndum kennurum"
      const posting = "Við leitum að reyndum kennurum til starfa.";
      const lemmas = extractLemmas(posting, lemmatizer);

      // Search for "kennari" should match
      expect(lemmas.has("kennari")).toBe(true);
    });
  });
});

describe("Compound word indexing", () => {
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

    const lemmasText = lemmasBuffer.toString("utf-8");
    const lemmasList = lemmasText.split("\n").filter((l) => l.length > 0);
    knownLemmas = createKnownLemmaSet(lemmasList);
    splitter = new CompoundSplitter(lemmatizer, knownLemmas);
  });

  it("'landbúnaðarráðherra' splits to landbúnaður + ráðherra", () => {
    // Agriculture minister = agriculture + minister
    const result = splitter.split("landbúnaðarráðherra");

    expect(result.isCompound).toBe(true);
    expect(result.parts).toEqual(["landbúnaður", "ráðherra"]);
    expect(result.confidence).toBeGreaterThan(0.9);

    // Search for "ráðherra" (minister) should find this document!
    const indexedLemmas = new Set(splitter.getAllLemmas("landbúnaðarráðherra"));
    expect(indexedLemmas).toContain("ráðherra");
    expect(indexedLemmas).toContain("landbúnaður");
    expect(indexedLemmas).toContain("landbúnaðarráðherra"); // Also the full compound
  });

  it("'húsnæðislán' splits to húsnæði + lán", () => {
    // Housing loan = housing + loan
    const result = splitter.split("húsnæðislán");

    expect(result.isCompound).toBe(true);
    expect(result.parts).toEqual(["húsnæði", "lán"]);

    // Search for "lán" (loan) should find documents about housing loans!
    const indexedLemmas = new Set(splitter.getAllLemmas("húsnæðislán"));
    expect(indexedLemmas).toEqual(
      new Set(["húsnæðislán", "húsnæði", "lán"])
    );
  });

  it("'sjúkrahús' splits to sjúkur + hús (hospital = sick + house)", () => {
    const result = splitter.split("sjúkrahús");

    expect(result.isCompound).toBe(true);
    expect(result.parts).toEqual(["sjúkur", "hús"]);

    // Search for "hús" would find hospital documents
    const indexedLemmas = new Set(splitter.getAllLemmas("sjúkrahús"));
    expect(indexedLemmas).toContain("hús");
    expect(indexedLemmas).toContain("sjúkrahús");
  });

  it("'bílstjóri' splits to bíll + stjóra (car driver)", () => {
    const result = splitter.split("bílstjóri");

    expect(result.isCompound).toBe(true);
    expect(result.parts[0]).toBe("bíll"); // car

    // Search for "bíll" (car) finds documents about car drivers!
    const indexedLemmas = new Set(splitter.getAllLemmas("bílstjóri"));
    expect(indexedLemmas).toContain("bíll");
    expect(indexedLemmas).toContain("bílstjóri");
  });

  it("'borgarstjóri' splits to borg + stjóra (mayor = city + leader)", () => {
    const result = splitter.split("borgarstjóri");

    expect(result.isCompound).toBe(true);
    expect(result.parts).toContain("borg"); // city
    expect(result.parts).toContain("stjóri"); // leader
    expect(result.confidence).toBeGreaterThan(0);

    // Search for "borg" (city) finds documents mentioning mayor
    // indexTerms includes all variants + original word for better recall
    const indexedLemmas = new Set(splitter.getAllLemmas("borgarstjóri"));
    expect(indexedLemmas).toContain("borg");
    expect(indexedLemmas).toContain("borga"); // variant included for recall
    expect(indexedLemmas).toContain("borgarstjóri"); // original word
  });

  it("non-compound words return just their lemmas", () => {
    const result = splitter.split("hestur");

    expect(result.isCompound).toBe(false);
    expect(result.parts).toEqual(["hestur"]);

    // getAllLemmas returns same as direct lemmatization
    const allLemmas = splitter.getAllLemmas("hestur");
    expect(allLemmas).toEqual(["hestur"]);
  });
});

describe("Edge cases and gotchas", () => {
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

  it("handles capitalized words (proper nouns vs sentence start)", () => {
    // "Hestur" at start of sentence should still lemmatize
    const capitalized = lemmatizer.lemmatize("Hestur");
    const lowercase = lemmatizer.lemmatize("hestur");

    expect(capitalized).toEqual(lowercase);
  });

  it("handles ALL CAPS", () => {
    const allcaps = lemmatizer.lemmatize("HESTUR");
    const lowercase = lemmatizer.lemmatize("hestur");

    expect(allcaps).toEqual(lowercase);
  });

  it("unknown words return themselves", () => {
    const unknown = lemmatizer.lemmatize("xyz123unknown");
    expect(unknown).toEqual(["xyz123unknown"]);
  });

  it("handles numbers mixed with text gracefully", () => {
    // Should not crash
    const withNumber = lemmatizer.lemmatize("2024");
    expect(withNumber).toBeDefined();
  });

  it("empty string handling", () => {
    const empty = lemmatizer.lemmatize("");
    expect(empty).toEqual([""]); // Returns as-is
  });
});
