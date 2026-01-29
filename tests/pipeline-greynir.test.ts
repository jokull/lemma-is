/**
 * Full pipeline tests using sentences from GreynirEngine test suite.
 *
 * These test the complete indexing flow: tokenization → lemmatization →
 * disambiguation → compound splitting → stopword removal.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
  CompoundSplitter,
  createKnownLemmaSet,
} from "../src/index.js";

describe("Full Pipeline - Greynir Sentences", () => {
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

  describe("News/Financial text", () => {
    it("extracts key lemmas from financial news", () => {
      const text =
        "Ríkissjóður stendur í blóma ef 27 milljarða arðgreiðsla Íslandsbanka er talin með.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        compoundSplitter: splitter,
        removeStopwords: true,
      });

      // Key content words should be extracted (all lowercased)
      expect(lemmas.has("ríkissjóður")).toBe(true);
      expect(lemmas.has("blómi") || lemmas.has("blóm")).toBe(true);
      expect(lemmas.has("arðgreiðsla")).toBe(true);
      expect(lemmas.has("íslandsbanki")).toBe(true); // lowercase

      // Compound parts should be indexed
      expect(lemmas.has("ríki")).toBe(true); // from ríkissjóður
      expect(lemmas.has("sjóður")).toBe(true);
      expect(lemmas.has("arður")).toBe(true); // from arðgreiðsla
      expect(lemmas.has("greiðsla")).toBe(true);

      // Stopwords should be removed
      expect(lemmas.has("í")).toBe(false);
      expect(lemmas.has("ef")).toBe(false);
      expect(lemmas.has("er")).toBe(false);
    });

    it("extracts lemmas from damage report", () => {
      const text = "Tjónið nam 10 milljörðum króna.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("tjón")).toBe(true);
      expect(lemmas.has("nema") || lemmas.has("nam")).toBe(true); // nam → nema (or nam as noun)
      expect(lemmas.has("milljarður")).toBe(true);
      expect(lemmas.has("króna")).toBe(true);
    });
  });

  describe("Complex sentences", () => {
    it("handles long sentence with multiple clauses", () => {
      const text =
        "Löngu áður en Jón borðaði ísinn sem hafði bráðnað hratt í hádeginu " +
        "fór ég á veitingastaðinn á horninu og keypti mér rauðvín með " +
        "hamborgaranum sem ég borðaði í gær með mikilli ánægju.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        compoundSplitter: splitter,
        removeStopwords: true,
      });

      // Verbs in various forms
      expect(lemmas.has("borða")).toBe(true); // borðaði
      expect(lemmas.has("bráðna")).toBe(true); // bráðnað
      expect(lemmas.has("fara")).toBe(true); // fór
      expect(lemmas.has("kaupa")).toBe(true); // keypti

      // Nouns with articles
      expect(lemmas.has("ís")).toBe(true); // ísinn
      expect(lemmas.has("veitingastaður")).toBe(true); // veitingastaðinn
      expect(lemmas.has("rauðvín")).toBe(true);
      expect(lemmas.has("hamborgari")).toBe(true); // hamborgaranum
      expect(lemmas.has("ánægja")).toBe(true); // ánægju

      // Compound parts
      expect(lemmas.has("veiting")).toBe(true); // from veitingastaður
      expect(lemmas.has("staður")).toBe(true);
    });

    it("handles embedded clauses", () => {
      const text =
        "Það að þau viðurkenna ekki að þjóðin er ósátt við gjörðir þeirra er alvarlegt.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("viðurkenna")).toBe(true);
      expect(lemmas.has("þjóð")).toBe(true); // þjóðin
      expect(lemmas.has("ósáttur")).toBe(true); // ósátt
      expect(lemmas.has("gjörð")).toBe(true); // gjörðir
      expect(lemmas.has("alvarlegur")).toBe(true); // alvarlegt
    });

    it("handles infinitive chains", () => {
      const text =
        "Hann hefur nú viðurkennt að hafa ákveðið sjálfur að birta " +
        "hvorki almenningi né Alþingi skýrsluna.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("viðurkenna")).toBe(true); // viðurkennt
      expect(lemmas.has("ákveða")).toBe(true); // ákveðið
      expect(lemmas.has("birta")).toBe(true);
      expect(lemmas.has("almenningur")).toBe(true); // almenningi
      expect(lemmas.has("skýrsla")).toBe(true); // skýrsluna
    });
  });

  describe("Measurements and dates", () => {
    it("extracts from measurement text", () => {
      const text = "Hitastig vatnsins var 30,5 gráður og ég var ánægð með það.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("hitastig")).toBe(true);
      expect(lemmas.has("vatn")).toBe(true); // vatnsins
      expect(lemmas.has("gráða")).toBe(true); // gráður
      expect(lemmas.has("ánægður")).toBe(true); // ánægð
    });

    it("handles date with place name", () => {
      const text = "Ég hitti hana þann 17. júní árið 1944 á Þingvöllum.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("hitta")).toBe(true); // hitti
      expect(lemmas.has("júní")).toBe(true);
      expect(lemmas.has("ár")).toBe(true); // árið
      expect(lemmas.has("þingvellir") || lemmas.has("þingvöllur")).toBe(true); // Þingvöllum (lowercase)
    });
  });

  describe("Passive and progressive", () => {
    it("handles passive progressive construction", () => {
      const text = "Hér er verið að gera tilraunir með þáttun.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("vera")).toBe(true); // verið
      expect(lemmas.has("gera")).toBe(true);
      expect(lemmas.has("tilraun")).toBe(true); // tilraunir
      expect(lemmas.has("þáttun")).toBe(true);
    });
  });

  describe("Perception verbs", () => {
    it("handles perception verb + infinitive", () => {
      const text = "Ég horfði á Pál borða kökuna.";

      const lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      expect(lemmas.has("horfa")).toBe(true); // horfði
      expect(lemmas.has("borða")).toBe(true); // infinitive
      expect(lemmas.has("kaka")).toBe(true); // kökuna
    });
  });

  describe("Disambiguation edge cases", () => {
    it("'á' as preposition vs verb", () => {
      // "á borðinu" - á should be preposition
      const prepText = "Bókin er á borðinu.";
      const prepLemmas = extractIndexableLemmas(prepText, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: false,
      });

      // Both readings may be indexed for search recall
      expect(prepLemmas.has("á")).toBe(true);

      // "Ég á bíl" - á is verb "eiga"
      const verbText = "Ég á bíl.";
      const verbLemmas = extractIndexableLemmas(verbText, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: false,
      });

      // For search, we index both possibilities
      expect(verbLemmas.has("eiga") || verbLemmas.has("á")).toBe(true);
    });

    it("'við' as pronoun vs preposition", () => {
      // "Við erum hér" - við is pronoun "we"
      const pronounText = "Við erum hér.";
      const pronounLemmas = extractIndexableLemmas(pronounText, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: false,
      });

      expect(pronounLemmas.has("ég") || pronounLemmas.has("við")).toBe(true);
      expect(pronounLemmas.has("vera")).toBe(true); // erum

      // "við gluggann" - við is preposition "by"
      const prepText = "Hann stóð við gluggann.";
      const prepLemmas = extractIndexableLemmas(prepText, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: false,
      });

      expect(prepLemmas.has("standa")).toBe(true); // stóð
      expect(prepLemmas.has("gluggi")).toBe(true); // gluggann
    });
  });

  describe("What gets indexed vs what doesn't", () => {
    it("indexes content words, skips function words", () => {
      const text = "Börnin fóru í bíó með vinum sínum í gær.";

      const withStopwords = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: false,
      });

      const withoutStopwords = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      // Content words in both
      expect(withStopwords.has("barn")).toBe(true);
      expect(withoutStopwords.has("barn")).toBe(true);
      expect(withStopwords.has("fara")).toBe(true);
      expect(withoutStopwords.has("fara")).toBe(true);
      expect(withStopwords.has("bíó")).toBe(true);
      expect(withoutStopwords.has("bíó")).toBe(true);
      expect(withStopwords.has("vinur")).toBe(true);
      expect(withoutStopwords.has("vinur")).toBe(true);

      // Stopwords only without removal
      expect(withStopwords.has("í")).toBe(true);
      expect(withoutStopwords.has("í")).toBe(false);
    });

    it("shows compound splitting benefit", () => {
      const text = "Húsnæðislánareglur og persónuupplýsingar eru mikilvægar.";

      const withCompounds = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        compoundSplitter: splitter,
        removeStopwords: true,
      });

      const withoutCompounds = extractIndexableLemmas(text, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      // Full compound in both
      expect(withCompounds.has("húsnæðislánareglur")).toBe(true);

      // Parts extracted via compound splitting
      // A search for "húsnæði" or "lánaregla" finds documents about housing loan rules
      expect(withCompounds.has("húsnæði")).toBe(true);
      expect(withCompounds.has("lánaregla") || withCompounds.has("upplýsing")).toBe(true);
    });
  });

  describe("Real search scenarios", () => {
    it("job posting findable by occupation search", () => {
      const posting = "Við leitum að reyndum kennurum til starfa í Reykjavík.";

      const lemmas = extractIndexableLemmas(posting, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      // User searches "kennari" - should find this
      expect(lemmas.has("kennari")).toBe(true);
      expect(lemmas.has("starf")).toBe(true);
      expect(lemmas.has("reykjavík")).toBe(true); // lowercase
    });

    it("recipe findable by ingredient search", () => {
      const recipe = "Bætið eggjunum í deigið og hrærið vel.";

      const lemmas = extractIndexableLemmas(recipe, lemmatizer, {
        bigrams: lemmatizer,
        removeStopwords: true,
      });

      // User searches "egg" - should find this
      expect(lemmas.has("egg")).toBe(true);
      expect(lemmas.has("deig")).toBe(true);
      expect(lemmas.has("hræra")).toBe(true);
    });

    it("news article findable by topic search", () => {
      const article = "Þingmenn ræddu frumvarpið í gær. Þingmaðurinn sagði frá áformum ríkisstjórnarinnar.";

      const lemmas = extractIndexableLemmas(article, lemmatizer, {
        bigrams: lemmatizer,
        compoundSplitter: splitter,
        removeStopwords: true,
      });

      // User searches "þingmaður" - should find this
      expect(lemmas.has("þingmaður")).toBe(true);
      expect(lemmas.has("frumvarp")).toBe(true);
      expect(lemmas.has("ríkisstjórn")).toBe(true);
      expect(lemmas.has("áform")).toBe(true);
    });
  });
});
