/**
 * Disambiguation rules for Icelandic.
 *
 * Based on GreynirEngine's Prefs.conf and linguistic patterns.
 * These rules help resolve ambiguous words by considering context.
 */

import type { WordClass } from "./types.js";

/**
 * A disambiguation preference rule.
 *
 * When the word matches and the context condition is met,
 * prefer `prefer` POS over `over` POS.
 */
export interface DisambiguationRule {
  /** The ambiguous word (lowercase) */
  word: string;
  /** Preferred part of speech in this context */
  prefer: WordClass;
  /** Dispreferred part of speech */
  over: WordClass;
  /** Context condition for when to apply this rule */
  context: "before_noun" | "before_verb" | "after_pronoun" | "sentence_start" | "any";
  /** Optional description */
  description?: string;
}

/**
 * Disambiguation rules extracted from Greynir's patterns.
 *
 * Format: { word, prefer, over, context }
 *
 * Common patterns:
 * - "á" as preposition (fs) when before noun, as verb "eiga" (so) after pronoun
 * - "við" as preposition (fs) when before noun, as pronoun (fn) at sentence start
 */
export const DISAMBIGUATION_RULES: DisambiguationRule[] = [
  // "á" - one of the most ambiguous words
  // Preposition: "á borðinu", "á Íslandi"
  // Verb (eiga): "Ég á bíl", "Hún á hest"
  // Noun (river): "við ána"
  {
    word: "á",
    prefer: "so", // verb "eiga"
    over: "fs", // preposition
    context: "after_pronoun",
    description: "á after pronoun = verb 'eiga' (I own, you own)",
  },
  {
    word: "á",
    prefer: "fs", // preposition
    over: "so", // verb
    context: "before_noun",
    description: "á before noun = preposition (on, at)",
  },

  // "við" - preposition vs pronoun
  // Preposition: "við gluggann", "við borðið"
  // Pronoun: "Við erum hér" (we are here)
  {
    word: "við",
    prefer: "fn", // pronoun "we"
    over: "fs", // preposition
    context: "sentence_start",
    description: "við at sentence start = pronoun 'we'",
  },
  {
    word: "við",
    prefer: "fs", // preposition
    over: "fn", // pronoun
    context: "before_noun",
    description: "við before noun = preposition 'by/at'",
  },

  // "af" - preposition vs adverb
  {
    word: "af",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "af before noun = preposition 'of/from'",
  },

  // "til" - preposition
  {
    word: "til",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "til before noun = preposition 'to'",
  },

  // "um" - preposition vs adverb
  {
    word: "um",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "um before noun = preposition 'about/around'",
  },

  // "yfir" - preposition vs adverb
  {
    word: "yfir",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "yfir before noun = preposition 'over'",
  },

  // "undir" - preposition vs adverb
  {
    word: "undir",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "undir before noun = preposition 'under'",
  },

  // "fyrir" - preposition vs adverb
  {
    word: "fyrir",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "fyrir before noun = preposition 'for/before'",
  },

  // "eftir" - preposition vs adverb
  {
    word: "eftir",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "eftir before noun = preposition 'after'",
  },

  // "frá" - preposition
  {
    word: "frá",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "frá before noun = preposition 'from'",
  },

  // "með" - preposition vs adverb
  {
    word: "með",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "með before noun = preposition 'with'",
  },

  // "í" - preposition
  {
    word: "í",
    prefer: "fs",
    over: "ao",
    context: "before_noun",
    description: "í before noun = preposition 'in'",
  },

  // "úr" - preposition vs noun (watch)
  {
    word: "úr",
    prefer: "fs",
    over: "no",
    context: "before_noun",
    description: "úr before noun = preposition 'out of'",
  },
];

/**
 * Look up rules that apply to a specific word.
 */
export function getRulesForWord(word: string): DisambiguationRule[] {
  const normalized = word.toLowerCase();
  return DISAMBIGUATION_RULES.filter((r) => r.word === normalized);
}

/**
 * Check if a word has disambiguation rules.
 */
export function hasDisambiguationRules(word: string): boolean {
  return DISAMBIGUATION_RULES.some((r) => r.word === word.toLowerCase());
}
