/**
 * Mini-grammar disambiguation rules for Icelandic.
 *
 * Uses case government (forsetningar stjórna falli) to disambiguate
 * prepositions from other parts of speech. For example:
 * - "á" + dative noun = preposition "on/at"
 * - "á" after pronoun = verb "eiga" (to own)
 *
 * Based on Greynir's Prepositions.conf but simplified for fast lookup.
 */

import type {
  GrammaticalCase,
  LemmaWithMorph,
  WordClass,
} from "./types.js";

/**
 * Preposition case government rules.
 *
 * Maps preposition lemma to the grammatical cases it governs.
 * When a preposition is followed by a noun in one of these cases,
 * we can be confident it's being used as a preposition.
 *
 * Source: Greynir's Prepositions.conf
 */
export const PREPOSITION_CASES: Map<string, Set<GrammaticalCase>> = new Map([
  // Both accusative and dative
  ["á", new Set(["þf", "þgf"])], // on/at (þf=direction, þgf=location)
  ["í", new Set(["þf", "þgf"])], // in (þf=into, þgf=inside)
  ["við", new Set(["þf", "þgf"])], // at/by (þf=against, þgf=near)
  ["með", new Set(["þf", "þgf"])], // with (þf=bring, þgf=accompany)
  ["undir", new Set(["þf", "þgf"])], // under (þf=motion, þgf=position)
  ["yfir", new Set(["þf", "þgf"])], // over (þf=motion, þgf=position)
  ["fyrir", new Set(["þf", "þgf"])], // for/before (þf=in exchange, þgf=in front)

  // Accusative only
  ["um", new Set(["þf"])], // about/around
  ["gegnum", new Set(["þf"])], // through
  ["kringum", new Set(["þf"])], // around
  ["umhverfis", new Set(["þf"])], // around/surrounding

  // Dative only
  ["af", new Set(["þgf"])], // of/from
  ["frá", new Set(["þgf"])], // from
  ["hjá", new Set(["þgf"])], // at/with (someone's place)
  ["úr", new Set(["þgf"])], // out of
  ["að", new Set(["þgf"])], // to/at
  ["móti", new Set(["þgf"])], // against
  ["nálægt", new Set(["þgf"])], // near
  ["gegn", new Set(["þgf"])], // against
  ["gagnvart", new Set(["þgf"])], // towards/regarding
  ["handa", new Set(["þgf"])], // for (someone)
  ["meðal", new Set(["ef"])], // among (actually genitive)

  // Genitive only
  ["til", new Set(["ef"])], // to
  ["án", new Set(["ef"])], // without
  ["vegna", new Set(["ef"])], // because of
  ["sakir", new Set(["ef"])], // because of
  ["utan", new Set(["ef"])], // outside
  ["innan", new Set(["ef"])], // inside
  ["meðfram", new Set(["þgf"])], // along
  ["milli", new Set(["ef"])], // between
  ["auk", new Set(["ef"])], // in addition to
  ["í stað", new Set(["ef"])], // instead of
]);

/**
 * Nominative-case pronouns that can precede verbs.
 * When one of these is followed by a potentially ambiguous word,
 * prefer the verb reading.
 */
export const NOMINATIVE_PRONOUNS = new Set([
  "ég",
  "þú",
  "hann",
  "hún",
  "það",
  "við",
  "þið",
  "þeir",
  "þær",
  "þau",
]);

/**
 * Result of applying a mini-grammar rule.
 */
export interface GrammarRuleMatch {
  /** The preferred lemma */
  lemma: string;
  /** The preferred POS */
  pos: WordClass;
  /** Rule that matched */
  rule: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Check if a preposition candidate can govern the case of the following word.
 *
 * @param prepLemma - The potential preposition lemma
 * @param nextWordMorph - Morphological features of the next word
 * @returns True if the preposition can govern this case
 */
export function canGovernCase(
  prepLemma: string,
  nextWordCase: GrammaticalCase | undefined
): boolean {
  if (!nextWordCase) return false;
  const cases = PREPOSITION_CASES.get(prepLemma);
  return cases?.has(nextWordCase) ?? false;
}

/**
 * Apply preposition+case rule to disambiguate.
 *
 * If the current word can be a preposition and the next word has
 * a case governed by that preposition, prefer the preposition reading.
 *
 * @param candidates - All possible readings of the current word
 * @param nextWordMorph - Morphological analyses of the next word
 * @returns GrammarRuleMatch if a rule applies, null otherwise
 */
export function applyPrepositionRule(
  candidates: LemmaWithMorph[],
  nextWordMorph: LemmaWithMorph[]
): GrammarRuleMatch | null {
  // Find preposition candidates
  const prepCandidates = candidates.filter((c) => c.pos === "fs");
  if (prepCandidates.length === 0) return null;

  // Check if any next word form has a case governed by any prep candidate
  for (const prep of prepCandidates) {
    for (const nextForm of nextWordMorph) {
      if (nextForm.morph?.case && canGovernCase(prep.lemma, nextForm.morph.case)) {
        return {
          lemma: prep.lemma,
          pos: "fs",
          rule: `prep+${nextForm.morph.case}`,
          confidence: 0.9,
        };
      }
    }
  }

  return null;
}

/**
 * Apply pronoun+verb rule to disambiguate.
 *
 * If the previous word is a nominative pronoun and the current word
 * can be a verb, prefer the verb reading.
 *
 * @param candidates - All possible readings of the current word
 * @param prevWord - The previous word (raw form)
 * @returns GrammarRuleMatch if a rule applies, null otherwise
 */
export function applyPronounVerbRule(
  candidates: LemmaWithMorph[],
  prevWord: string | null
): GrammarRuleMatch | null {
  if (!prevWord) return null;

  const prevLower = prevWord.toLowerCase();
  if (!NOMINATIVE_PRONOUNS.has(prevLower)) return null;

  // Find verb candidates
  const verbCandidates = candidates.filter((c) => c.pos === "so");
  if (verbCandidates.length === 0) return null;

  // Prefer verb over preposition/noun when after pronoun
  const hasNonVerb = candidates.some((c) => c.pos !== "so");
  if (!hasNonVerb) return null;

  // Return the verb candidate (prefer eiga for "á")
  const eigaCandidate = verbCandidates.find((c) => c.lemma === "eiga");
  const verbCandidate = eigaCandidate ?? verbCandidates[0];

  return {
    lemma: verbCandidate.lemma,
    pos: "so",
    rule: "pronoun+verb",
    confidence: 0.85,
  };
}

/**
 * Apply all mini-grammar rules in sequence.
 *
 * Rules are applied in order of specificity:
 * 1. Preposition + case government (most reliable)
 * 2. Pronoun + verb pattern
 *
 * @param candidates - All possible readings of the current word
 * @param prevWord - Previous word (raw form)
 * @param nextWordMorph - Morphological analyses of the next word
 * @returns GrammarRuleMatch if any rule applies, null otherwise
 */
export function applyGrammarRules(
  candidates: LemmaWithMorph[],
  prevWord: string | null,
  nextWordMorph: LemmaWithMorph[]
): GrammarRuleMatch | null {
  // Rule 1: Preposition + governed case
  const prepRule = applyPrepositionRule(candidates, nextWordMorph);
  if (prepRule) return prepRule;

  // Rule 2: Pronoun + verb
  const verbRule = applyPronounVerbRule(candidates, prevWord);
  if (verbRule) return verbRule;

  return null;
}

/**
 * Check if a word is a known preposition.
 */
export function isKnownPreposition(lemma: string): boolean {
  return PREPOSITION_CASES.has(lemma);
}

/**
 * Get the cases governed by a preposition.
 */
export function getGovernedCases(prepLemma: string): Set<GrammaticalCase> | undefined {
  return PREPOSITION_CASES.get(prepLemma);
}
