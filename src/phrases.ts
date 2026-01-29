/**
 * Static multi-word phrases for Icelandic.
 *
 * Source: Extracted from GreynirEngine's Phrases.conf (MIT License)
 * https://github.com/mideind/GreynirEngine
 *
 * These phrases should be recognized as units rather than individual words,
 * enabling better stopword detection and lemmatization.
 */

/**
 * A static phrase definition.
 */
export interface StaticPhrase {
  /** The canonical/lemma form of the phrase */
  lemma: string;
  /** Whether this phrase functions as a stopword (e.g., "til dæmis") */
  isStopword: boolean;
  /** Part of speech category */
  pos?: "ao" | "fs" | "st" | "entity";
}

/**
 * Common Icelandic multi-word phrases.
 * Keys are lowercase, normalized forms.
 */
export const STATIC_PHRASES: Map<string, StaticPhrase> = new Map([
  // Adverbial phrases (ao frasi) - often function as stopwords
  ["til dæmis", { lemma: "til dæmi", isStopword: true, pos: "ao" }],
  ["með öðrum orðum", { lemma: "með annar orð", isStopword: true, pos: "ao" }],
  ["í raun", { lemma: "í raun", isStopword: true, pos: "ao" }],
  ["í raun og veru", { lemma: "í raun og vera", isStopword: true, pos: "ao" }],
  ["af og til", { lemma: "af og til", isStopword: true, pos: "ao" }],
  ["aftur á móti", { lemma: "aftur á mót", isStopword: true, pos: "ao" }],
  ["alla vega", { lemma: "allur vegur", isStopword: true, pos: "ao" }],
  ["alls ekki", { lemma: "alls ekki", isStopword: true, pos: "ao" }],
  ["alls staðar", { lemma: "allur staður", isStopword: true, pos: "ao" }],
  ["allt í allt", { lemma: "allur í allur", isStopword: true, pos: "ao" }],
  ["annars vegar", { lemma: "annar vegur", isStopword: true, pos: "ao" }],
  ["auk þess", { lemma: "auk það", isStopword: true, pos: "ao" }],
  ["að auki", { lemma: "að auki", isStopword: true, pos: "ao" }],
  ["að vísu", { lemma: "að vís", isStopword: true, pos: "ao" }],
  ["að sjálfsögðu", { lemma: "að sjálfsagður", isStopword: true, pos: "ao" }],
  ["að minnsta kosti", { lemma: "að lítill kostur", isStopword: true, pos: "ao" }],
  ["að öllu leyti", { lemma: "að allur leyti", isStopword: true, pos: "ao" }],
  ["að nokkru leyti", { lemma: "að nokkur leyti", isStopword: true, pos: "ao" }],
  ["ef til vill", { lemma: "ef til vilja", isStopword: true, pos: "ao" }],
  ["einhvers staðar", { lemma: "einhver staður", isStopword: true, pos: "ao" }],
  ["einhvern veginn", { lemma: "einhver vegur", isStopword: true, pos: "ao" }],
  ["ekki síst", { lemma: "ekki síður", isStopword: true, pos: "ao" }],
  ["engu að síður", { lemma: "enginn að síður", isStopword: true, pos: "ao" }],
  ["fyrst og fremst", { lemma: "snemma og fremri", isStopword: true, pos: "ao" }],
  ["hins vegar", { lemma: "hinn vegur", isStopword: true, pos: "ao" }],
  ["hér og þar", { lemma: "hér og þar", isStopword: true, pos: "ao" }],
  ["hér um bil", { lemma: "hér um bil", isStopword: true, pos: "ao" }],
  ["hér á landi", { lemma: "hér á land", isStopword: true, pos: "ao" }],
  ["hvað mest", { lemma: "hvað mjög", isStopword: true, pos: "ao" }],
  ["hverju sinni", { lemma: "hver sinn", isStopword: true, pos: "ao" }],
  ["hvorki né", { lemma: "hvorki né", isStopword: true, pos: "ao" }],
  ["í burtu", { lemma: "í burtu", isStopword: true, pos: "ao" }],
  ["í gær", { lemma: "í gær", isStopword: true, pos: "ao" }],
  ["í senn", { lemma: "í senn", isStopword: true, pos: "ao" }],
  ["í sífellu", { lemma: "í sífella", isStopword: true, pos: "ao" }],
  ["lengi vel", { lemma: "lengi vel", isStopword: true, pos: "ao" }],
  ["meira að segja", { lemma: "mikill að segja", isStopword: true, pos: "ao" }],
  ["meira og minna", { lemma: "mikill og lítill", isStopword: true, pos: "ao" }],
  ["meðal annars", { lemma: "meðal annar", isStopword: true, pos: "ao" }],
  ["nokkurn veginn", { lemma: "nokkur vegur", isStopword: true, pos: "ao" }],
  ["og svo framvegis", { lemma: "og svo framvegis", isStopword: true, pos: "ao" }],
  ["satt að segja", { lemma: "sannur að segja", isStopword: true, pos: "ao" }],
  ["sem betur fer", { lemma: "sem vel fara", isStopword: true, pos: "ao" }],
  ["smám saman", { lemma: "smátt saman", isStopword: true, pos: "ao" }],
  ["svo sem", { lemma: "svo sem", isStopword: true, pos: "ao" }],
  ["sér í lagi", { lemma: "sér í lag", isStopword: true, pos: "ao" }],
  ["til og frá", { lemma: "til og frá", isStopword: true, pos: "ao" }],
  ["til baka", { lemma: "til baka", isStopword: true, pos: "ao" }],
  ["vítt og breitt", { lemma: "vítt og breitt", isStopword: true, pos: "ao" }],
  ["á ný", { lemma: "á ný", isStopword: true, pos: "ao" }],
  ["á meðan", { lemma: "á meðan", isStopword: true, pos: "ao" }],
  ["á sama tíma", { lemma: "á samur tími", isStopword: true, pos: "ao" }],
  ["á hinn bóginn", { lemma: "á hinn bógur", isStopword: true, pos: "ao" }],
  ["þar af leiðandi", { lemma: "þar af leiða", isStopword: true, pos: "ao" }],
  ["þar að auki", { lemma: "þar að auki", isStopword: true, pos: "ao" }],
  ["það er að segja", { lemma: "það vera að segja", isStopword: true, pos: "ao" }],
  ["þess vegna", { lemma: "það vegna", isStopword: true, pos: "ao" }],
  ["því miður", { lemma: "það lítt", isStopword: true, pos: "ao" }],
  ["þrátt fyrir", { lemma: "þrátt fyrir", isStopword: true, pos: "ao" }],

  // Time expressions
  ["á dögunum", { lemma: "á dagur", isStopword: true, pos: "ao" }],
  ["á sínum tíma", { lemma: "á sinn tími", isStopword: true, pos: "ao" }],
  ["á endanum", { lemma: "á endi", isStopword: true, pos: "ao" }],
  ["einu sinni", { lemma: "einn sinn", isStopword: false, pos: "ao" }],
  ["eitt sinn", { lemma: "einn sinn", isStopword: false, pos: "ao" }],
  ["í fyrsta sinn", { lemma: "í fyrstur sinn", isStopword: false, pos: "ao" }],
  ["í kvöld", { lemma: "í kvöld", isStopword: false, pos: "ao" }],
  ["í morgun", { lemma: "í morgunn", isStopword: false, pos: "ao" }],
  ["á morgun", { lemma: "á morgunn", isStopword: false, pos: "ao" }],

  // Prepositional phrases (fs frasi)
  ["fyrir hönd", { lemma: "fyrir hönd", isStopword: false, pos: "fs" }],
  ["með tilliti til", { lemma: "með tillit til", isStopword: false, pos: "fs" }],
  ["í ljósi", { lemma: "í ljós", isStopword: false, pos: "fs" }],
  ["í stað", { lemma: "í staður", isStopword: false, pos: "fs" }],
  ["fyrir aftan", { lemma: "fyrir aftan", isStopword: false, pos: "fs" }],
  ["fyrir austan", { lemma: "fyrir austan", isStopword: false, pos: "fs" }],
  ["fyrir framan", { lemma: "fyrir framan", isStopword: false, pos: "fs" }],
  ["fyrir handan", { lemma: "fyrir handan", isStopword: false, pos: "fs" }],
  ["fyrir innan", { lemma: "fyrir innan", isStopword: false, pos: "fs" }],
  ["fyrir neðan", { lemma: "fyrir neðan", isStopword: false, pos: "fs" }],
  ["fyrir norðan", { lemma: "fyrir norðan", isStopword: false, pos: "fs" }],
  ["fyrir ofan", { lemma: "fyrir ofan", isStopword: false, pos: "fs" }],
  ["fyrir sunnan", { lemma: "fyrir sunnan", isStopword: false, pos: "fs" }],
  ["fyrir utan", { lemma: "fyrir utan", isStopword: false, pos: "fs" }],
  ["fyrir vestan", { lemma: "fyrir vestan", isStopword: false, pos: "fs" }],
  ["í gegnum", { lemma: "í gegnum", isStopword: false, pos: "fs" }],
  ["í kringum", { lemma: "í kringum", isStopword: false, pos: "fs" }],
  ["innan við", { lemma: "innan við", isStopword: false, pos: "fs" }],
  ["upp úr", { lemma: "upp úr", isStopword: false, pos: "fs" }],
  ["þvert á", { lemma: "þvert á", isStopword: false, pos: "fs" }],

  // Conjunction-like phrases (st frasi)
  ["þar eð", { lemma: "þar eð", isStopword: true, pos: "st" }],

  // Named entities - organizations/institutions (NOT stopwords)
  ["sameinuðu þjóðirnar", { lemma: "Sameinuðu þjóðirnar", isStopword: false, pos: "entity" }],
  ["evrópusambandið", { lemma: "Evrópusambandið", isStopword: false, pos: "entity" }],
  ["nato", { lemma: "NATO", isStopword: false, pos: "entity" }],
  ["nató", { lemma: "NATO", isStopword: false, pos: "entity" }],
]);

/**
 * Check if a phrase starting at the given position exists.
 * Returns the phrase info and length if found, null otherwise.
 */
export function matchPhrase(
  words: string[],
  startIndex: number
): { phrase: StaticPhrase; wordCount: number } | null {
  // Try longest matches first (up to 4 words)
  for (let len = Math.min(4, words.length - startIndex); len >= 2; len--) {
    const phraseWords = words.slice(startIndex, startIndex + len);
    const phraseKey = phraseWords.join(" ").toLowerCase();
    const phrase = STATIC_PHRASES.get(phraseKey);
    if (phrase) {
      return { phrase, wordCount: len };
    }
  }
  return null;
}

/**
 * Check if a normalized string is a known phrase.
 */
export function isKnownPhrase(text: string): boolean {
  return STATIC_PHRASES.has(text.toLowerCase());
}

/**
 * Get phrase info for a normalized string.
 */
export function getPhraseInfo(text: string): StaticPhrase | undefined {
  return STATIC_PHRASES.get(text.toLowerCase());
}
