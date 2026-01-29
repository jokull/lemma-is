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
 * A lemma with its word class.
 */
export interface LemmaWithPOS {
  lemma: string;
  pos: WordClass;
}

/**
 * Interface for lemmatizer-like objects.
 * Used to avoid circular dependency between modules.
 */
export interface LemmatizerLike {
  lemmatize(word: string): string[];
  lemmatizeWithPOS?(word: string): LemmaWithPOS[];
}
