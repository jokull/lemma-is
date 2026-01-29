/**
 * Edge case test data extracted from GreynirEngine test suite.
 * Source: https://github.com/mideind/GreynirEngine (MIT License)
 *
 * These test cases cover disambiguation, compound words, names,
 * and other challenging Icelandic NLP scenarios.
 */

export interface TestCase {
  sentence: string;
  /** Expected lemmas for specific words */
  expectedLemmas?: Record<string, string>;
  /** Words that should NOT be split as compounds */
  noSplit?: string[];
  /** Words that SHOULD be split as compounds */
  shouldSplit?: Record<string, string[]>;
  /** Words that should be stopwords in context */
  stopwords?: string[];
  /** Words that should NOT be stopwords despite ambiguity */
  notStopwords?: string[];
  /** Category of edge case */
  category: string;
}

// =============================================================================
// COMPOUND WORDS - from test_reynir.py test_compounds()
// =============================================================================

export const COMPOUND_TESTS: TestCase[] = [
  {
    sentence: "Katrín Júlíusdóttir var iðnaðar- og viðskiptaráðherra",
    shouldSplit: {
      "viðskiptaráðherra": ["viðskipti", "ráðherra"],
    },
    category: "compound-conjunction",
  },
  {
    sentence: "fjármála- og efnahagsráðherra",
    expectedLemmas: {
      "fjármála- og efnahagsráðherra": "fjármála- og efnahags-ráðherra",
    },
    category: "compound-conjunction",
  },
  {
    sentence: "tösku- og hanskabúðina",
    expectedLemmas: {
      "tösku- og hanskabúðina": "tösku- og hanskabúð",
    },
    category: "compound-conjunction",
  },
  {
    sentence: "Félags- og barnamálaráðherra",
    expectedLemmas: {
      "Félags- og barnamálaráðherra": "Félags- og barnamála-ráðherra",
    },
    category: "compound-conjunction",
  },
  {
    sentence: "Barnið fór í augnrannsóknina eftir húsnæðiskaupin.",
    shouldSplit: {
      augnrannsóknina: ["auga", "rannsókn"],
      húsnæðiskaupin: ["húsnæði", "kaup"],
    },
    category: "compound-basic",
  },
  {
    sentence: "Barnið fór í loðfílarannsókn.",
    shouldSplit: {
      loðfílarannsókn: ["loðfíll", "rannsókn"], // or ["lús", "fíll", "rannsókn"]?
    },
    category: "compound-complex",
  },
];

// =============================================================================
// PLACE NAMES - should NOT be split
// =============================================================================

export const PLACE_NAME_TESTS: TestCase[] = [
  {
    sentence: "Ég fór til Íslands í sumar.",
    noSplit: ["Íslands"],
    expectedLemmas: { Íslands: "Ísland" },
    category: "place-name",
  },
  {
    sentence: "Hann bjó í Englandi.",
    noSplit: ["Englandi"],
    expectedLemmas: { Englandi: "England" },
    category: "place-name",
  },
  {
    sentence: "Ferðin til Grænlands var löng.",
    noSplit: ["Grænlands"],
    expectedLemmas: { Grænlands: "Grænland" },
    category: "place-name",
  },
  {
    sentence: "Hún er frá Finnlandi.",
    noSplit: ["Finnlandi"],
    category: "place-name",
  },
  {
    sentence: "Gunnar á Hlíðarenda var vinur Njáls á Bergþórshvoli.",
    noSplit: ["Hlíðarenda", "Bergþórshvoli"],
    category: "place-name-literary",
  },
];

// =============================================================================
// PERSON NAMES - from test_reynir.py test_lemmas()
// =============================================================================

export const PERSON_NAME_TESTS: TestCase[] = [
  // Icelandic names
  {
    sentence: "Hér er Jón Daði Vignisson.",
    expectedLemmas: { "Jón Daði Vignisson": "Jón Daði Vignisson" },
    noSplit: ["Vignisson"],
    category: "person-icelandic",
  },
  {
    sentence: "Hér er Helgi Björns.",
    expectedLemmas: { "Helgi Björns": "Helgi Björns" },
    category: "person-patronym",
  },
  // Foreign names with particles
  {
    sentence: "Hér er Úrsúla von der Leyen.",
    expectedLemmas: { "Úrsúla von der Leyen": "Úrsúla von der Leyen" },
    category: "person-foreign-particle",
  },
  {
    sentence: "Hér er Carla de la Cruz.",
    expectedLemmas: { "Carla de la Cruz": "Carla de la Cruz" },
    category: "person-foreign-particle",
  },
  {
    sentence: "Hér er Dietrich van Helsing.",
    expectedLemmas: { "Dietrich van Helsing": "Dietrich van Helsing" },
    category: "person-foreign-particle",
  },
  {
    sentence: "Hér er Helmine van de Fnupft.",
    expectedLemmas: { "Helmine van de Fnupft": "Helmine van de Fnupft" },
    category: "person-foreign-particle",
  },
  {
    sentence: "Hér er Barack Obama.",
    expectedLemmas: { "Barack Obama": "Barack Obama" },
    category: "person-foreign",
  },
  {
    sentence: "Hér er Díana Woodward.",
    expectedLemmas: { "Díana Woodward": "Díana Woodward" },
    category: "person-mixed",
  },
  // FALSE POSITIVE: "von" as noun, not name particle
  {
    sentence: "Hér er von Helgu.",
    expectedLemmas: { von: "von", Helgu: "Helga" },
    notStopwords: ["von"], // "von" = hope (noun), not a name particle here
    category: "person-false-positive",
  },
  // FALSE POSITIVE: incomplete name particle
  {
    sentence: "Hér er Jón de la.",
    expectedLemmas: { Jón: "Jón", de: "de", la: "la" },
    category: "person-false-positive",
  },
];

// =============================================================================
// DISAMBIGUATION - "á" and other ambiguous words
// =============================================================================

export const DISAMBIGUATION_TESTS: TestCase[] = [
  // "á" as preposition (stopword)
  {
    sentence: "Bókin er á borðinu.",
    expectedLemmas: { á: "á" }, // preposition
    stopwords: ["á"],
    category: "disambig-preposition",
  },
  {
    sentence: "Hann er á Íslandi.",
    expectedLemmas: { á: "á" },
    stopwords: ["á"],
    category: "disambig-preposition",
  },
  // "á" as verb "eiga" (NOT stopword)
  {
    sentence: "Ég á bíl.",
    expectedLemmas: { á: "eiga" },
    notStopwords: ["á"],
    category: "disambig-verb",
  },
  {
    sentence: "Hún á hest.",
    expectedLemmas: { á: "eiga" },
    notStopwords: ["á"],
    category: "disambig-verb",
  },
  // "á" as noun (river) - NOT stopword
  {
    sentence: "Við ána er fallegt.",
    expectedLemmas: { ána: "á" }, // noun "á" = river
    notStopwords: ["ána"],
    category: "disambig-noun",
  },
  // "við" disambiguation
  {
    sentence: "Við erum hér.",
    expectedLemmas: { Við: "ég" }, // pronoun "we"
    stopwords: ["Við"],
    category: "disambig-pronoun",
  },
  {
    sentence: "Hann stóð við gluggann.",
    expectedLemmas: { við: "við" }, // preposition "by"
    stopwords: ["við"],
    category: "disambig-preposition",
  },
  {
    sentence: "Viðurinn er harður.",
    expectedLemmas: { Viðurinn: "viður" }, // noun "wood"
    notStopwords: ["Viðurinn"],
    category: "disambig-noun",
  },
];

// =============================================================================
// SENTENCE SPLITTING - from test_reynir.py test_sentence_split()
// =============================================================================

export const SENTENCE_SPLIT_TESTS: TestCase[] = [
  {
    sentence: "Ég hitti próf. Jón Mýrdal áðan.",
    // Should be ONE sentence (próf. = prófessor, not sentence end)
    expectedLemmas: { "próf.": "prófessor" },
    category: "abbrev-title",
  },
  {
    sentence: "Ég tók samræmt próf. Það var létt.",
    // Should be TWO sentences (próf = exam, sentence ends)
    category: "abbrev-not-title",
  },
  {
    sentence: "Próf. Páll var ósammála próf. Höllu um ritgerðina.",
    // ONE sentence with two professors
    category: "abbrev-multiple",
  },
  {
    sentence: "Ég hitti dr. Jón Mýrdal áðan.",
    expectedLemmas: { "dr.": "doktor" },
    category: "abbrev-title",
  },
  {
    sentence: "Ég hitti t.d. hr. Jón Mýrdal þann 23. maí.",
    // Multiple abbreviations
    category: "abbrev-multiple",
  },
];

// =============================================================================
// AMOUNTS AND CURRENCIES - from test_parse.py test_amounts()
// =============================================================================

export const AMOUNT_TESTS: TestCase[] = [
  {
    sentence: "Tjónið nam 10 milljörðum króna.",
    expectedLemmas: {
      Tjónið: "tjón",
      nam: "nema",
    },
    category: "amount-isk",
  },
  {
    sentence: "Tjónið þann 22. maí nam einum milljarði króna.",
    expectedLemmas: {
      nam: "nema",
    },
    category: "amount-with-date",
  },
  {
    sentence: "Tjónið þann 19. október 1983 nam 4,8 milljörðum dala.",
    category: "amount-usd",
  },
  {
    sentence: "Hún skuldaði mér 1.000 dollara.",
    category: "amount-formatted",
  },
];

// =============================================================================
// COMPLEX SENTENCES - from test_parse.py
// =============================================================================

export const COMPLEX_SENTENCE_TESTS: TestCase[] = [
  {
    sentence: "Hér er verið að gera tilraunir með þáttun.",
    expectedLemmas: {
      verið: "vera",
      gera: "gera",
      tilraunir: "tilraun",
      þáttun: "þáttun",
    },
    category: "passive-progressive",
  },
  {
    sentence: "Hitastig vatnsins var 30,5 gráður og ég var ánægð með það.",
    expectedLemmas: {
      Hitastig: "hitastig",
      vatnsins: "vatn",
      gráður: "gráða",
      ánægð: "ánægður",
    },
    category: "measurement",
  },
  {
    sentence: "Ég hitti hana þann 17. júní árið 1944 á Þingvöllum.",
    expectedLemmas: {
      hitti: "hitta",
      Þingvöllum: "Þingvellir",
    },
    noSplit: ["Þingvöllum"],
    category: "date-place",
  },
  {
    sentence:
      "Löngu áður en Jón borðaði ísinn sem hafði bráðnað hratt í hádeginu " +
      "fór ég á veitingastaðinn á horninu og keypti mér rauðvín með " +
      "hamborgaranum sem ég borðaði í gær með mikilli ánægju.",
    expectedLemmas: {
      borðaði: "borða",
      ísinn: "ís", // NOT "Ísland"!
      bráðnað: "bráðna",
      veitingastaðinn: "veitingastaður",
      keypti: "kaupa",
      rauðvín: "rauðvín",
      hamborgaranum: "hamborgari",
      ánægju: "ánægja",
    },
    shouldSplit: {
      veitingastaðinn: ["veitingar", "staður"],
    },
    category: "long-complex",
  },
  {
    sentence: "Ég horfði á Pál borða kökuna.",
    expectedLemmas: {
      horfði: "horfa",
      borða: "borða", // infinitive, not noun
      kökuna: "kaka",
    },
    category: "perception-verb",
  },
  {
    sentence:
      "Það að þau viðurkenna ekki að þjóðin er ósátt við gjörðir þeirra er alvarlegt.",
    expectedLemmas: {
      viðurkenna: "viðurkenna",
      þjóðin: "þjóð",
      ósátt: "ósáttur",
      gjörðir: "gjörð",
      alvarlegt: "alvarlegur",
    },
    category: "embedded-clause",
  },
  {
    sentence:
      "Hann hefur nú viðurkennt að hafa ákveðið sjálfur að birta " +
      "hvorki almenningi né Alþingi skýrsluna.",
    expectedLemmas: {
      viðurkennt: "viðurkenna",
      ákveðið: "ákveða",
      birta: "birta",
      almenningi: "almenningur",
      Alþingi: "Alþingi",
      skýrsluna: "skýrsla",
    },
    noSplit: ["Alþingi"],
    category: "infinitive-chain",
  },
  {
    sentence:
      "Ríkissjóður stendur í blóma ef 27 milljarða arðgreiðsla Íslandsbanka er talin með.",
    expectedLemmas: {
      Ríkissjóður: "ríkissjóður",
      blóma: "blómi",
      arðgreiðsla: "arðgreiðsla",
      Íslandsbanka: "Íslandsbanki",
    },
    shouldSplit: {
      Ríkissjóður: ["ríki", "sjóður"],
      arðgreiðsla: ["arður", "greiðsla"],
    },
    noSplit: ["Íslandsbanka"], // proper noun
    category: "financial",
  },
];

// =============================================================================
// COMPANY NAMES
// =============================================================================

export const COMPANY_NAME_TESTS: TestCase[] = [
  {
    sentence: "Hér er Super Mattel AS.",
    expectedLemmas: { "Super Mattel AS": "Super Mattel AS" },
    category: "company-foreign",
  },
  {
    sentence: "Hér er SHAPP Games.",
    expectedLemmas: { "SHAPP Games": "SHAPP Games" },
    category: "company-acronym",
  },
  {
    sentence: "Hér er Ikea.",
    expectedLemmas: { Ikea: "Ikea" },
    category: "company-single",
  },
];

// =============================================================================
// TITLES (books, articles, etc.)
// =============================================================================

export const TITLE_TESTS: TestCase[] = [
  {
    sentence: "Hér er The Trials and Tribulations of the Cat.",
    expectedLemmas: {
      "The Trials and Tribulations of the Cat":
        "The Trials and Tribulations of the Cat",
    },
    category: "title-english",
  },
];

// =============================================================================
// ALL TESTS COMBINED
// =============================================================================

export const ALL_EDGE_CASES: TestCase[] = [
  ...COMPOUND_TESTS,
  ...PLACE_NAME_TESTS,
  ...PERSON_NAME_TESTS,
  ...DISAMBIGUATION_TESTS,
  ...SENTENCE_SPLIT_TESTS,
  ...AMOUNT_TESTS,
  ...COMPLEX_SENTENCE_TESTS,
  ...COMPANY_NAME_TESTS,
  ...TITLE_TESTS,
];

// Group by category for selective testing
export const TESTS_BY_CATEGORY = ALL_EDGE_CASES.reduce(
  (acc, test) => {
    const cat = test.category.split("-")[0]; // e.g., "compound" from "compound-basic"
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(test);
    return acc;
  },
  {} as Record<string, TestCase[]>
);
