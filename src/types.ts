/**
 * Shared type definitions to avoid circular imports.
 */

/**
 * Word class (part-of-speech) codes from BÍN.
 *
 * These are simplified from BÍN's detailed categories:
 * - kk/kvk/hk (gendered nouns) → 'no'
 * - pfn (personal pronoun) → 'fn'
 */
export type WordClass =
  | "no" // nafnorð (noun)
  | "so" // sagnorð (verb)
  | "lo" // lýsingarorð (adjective)
  | "ao" // atviksorð (adverb)
  | "fs" // forsetning (preposition)
  | "fn" // fornafn (pronoun)
  | "st" // samtenging (conjunction)
  | "to" // töluorð (numeral)
  | "gr" // greinir (article)
  | "uh"; // upphrópun (interjection)

/**
 * Human-readable names for word classes.
 */
export const WORD_CLASS_NAMES: Record<WordClass, string> = {
  no: "noun",
  so: "verb",
  lo: "adjective",
  ao: "adverb",
  fs: "preposition",
  fn: "pronoun",
  st: "conjunction",
  to: "numeral",
  gr: "article",
  uh: "interjection",
};

/**
 * Icelandic names for word classes.
 */
export const WORD_CLASS_NAMES_IS: Record<WordClass, string> = {
  no: "nafnorð",
  so: "sagnorð",
  lo: "lýsingarorð",
  ao: "atviksorð",
  fs: "forsetning",
  fn: "fornafn",
  st: "samtenging",
  to: "töluorð",
  gr: "greinir",
  uh: "upphrópun",
};

/**
 * Grammatical case (fall) in Icelandic.
 */
export type GrammaticalCase = "nf" | "þf" | "þgf" | "ef";

/**
 * Grammatical gender (kyn) in Icelandic.
 */
export type GrammaticalGender = "kk" | "kvk" | "hk";

/**
 * Grammatical number (tala) in Icelandic.
 */
export type GrammaticalNumber = "et" | "ft";

/**
 * Human-readable names for cases.
 */
export const CASE_NAMES: Record<GrammaticalCase, string> = {
  nf: "nominative",
  þf: "accusative",
  þgf: "dative",
  ef: "genitive",
};

/**
 * Human-readable names for genders.
 */
export const GENDER_NAMES: Record<GrammaticalGender, string> = {
  kk: "masculine",
  kvk: "feminine",
  hk: "neuter",
};

/**
 * Human-readable names for numbers.
 */
export const NUMBER_NAMES: Record<GrammaticalNumber, string> = {
  et: "singular",
  ft: "plural",
};

/**
 * Morphological features extracted from BÍN.
 */
export interface MorphFeatures {
  case?: GrammaticalCase;
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;
}

/**
 * A lemma with its word class.
 */
export interface LemmaWithPOS {
  lemma: string;
  pos: WordClass;
}

/**
 * A lemma with word class and morphological features.
 */
export interface LemmaWithMorph extends LemmaWithPOS {
  morph?: MorphFeatures;
}

/**
 * Interface for lemmatizer-like objects.
 * Used to avoid circular dependency between modules.
 */
export interface LemmatizerLike {
  lemmatize(word: string): string[];
  lemmatizeWithPOS?(word: string): LemmaWithPOS[];
}

/**
 * Interface for bigram frequency lookup.
 * Used for disambiguation scoring.
 */
export interface BigramProvider {
  freq(word1: string, word2: string): number;
}
