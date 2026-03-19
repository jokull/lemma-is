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
  LemmaWithPOS,
  WordClass,
} from "./types.js";

/**
 * Interface for lemmatizer used in grammar rules.
 */
export interface GrammarLemmatizerLike {
  lemmatizeWithPOS?(word: string): LemmaWithPOS[];
  lemmatizeWithMorph?(word: string): LemmaWithMorph[];
}

/**
 * Infer grammatical case from Icelandic definite article suffixes.
 *
 * When morph data lacks case info (e.g., core binary), we can often
 * determine case from the word form itself. Definite article suffixes
 * in Icelandic are highly regular:
 *
 * Nominative: -inn (m.sg), -in (f.sg), -ið (n.sg), -nir (m.pl), -nar (f.pl), -in (n.pl)
 * Accusative: -inn (m.sg), -ina (f.sg), -ið (n.sg), -na (m.pl), -nar (f.pl), -in (n.pl)
 * Dative: -inum (m.sg), -inni (f.sg), -inu (n.sg), -unum (pl)
 * Genitive: -ins (m/n.sg), -innar (f.sg), -nna (pl)
 *
 * Note: nominative and accusative overlap heavily. The key distinction
 * for "á" disambiguation is dative vs non-dative: dative after "á"
 * is unambiguously preposition.
 */
export function inferCaseFromSuffix(word: string): Set<GrammaticalCase> {
  const w = word.toLowerCase();
  const cases = new Set<GrammaticalCase>();

  // Dative definite (most distinctive — check first, longest match first)
  if (w.endsWith("unum") || w.endsWith("inum") || w.endsWith("inni") || w.endsWith("inu")) {
    cases.add("þgf");
    return cases; // Dative suffixes are unambiguous
  }

  // Genitive definite
  if (w.endsWith("innar") || w.endsWith("nna") || w.endsWith("ins")) {
    cases.add("ef");
    return cases;
  }

  // Nominative/accusative definite (these overlap, so return both)
  if (w.endsWith("inn") || w.endsWith("ið") || w.endsWith("nar") || w.endsWith("nir")) {
    cases.add("nf");
    cases.add("þf");
    return cases;
  }
  if (w.endsWith("ina")) {
    cases.add("þf"); // Accusative feminine definite
    return cases;
  }

  // Bare noun endings (less reliable, skip)
  return cases;
}

/**
 * Preposition case government rules.
 *
 * Maps preposition lemma to the grammatical cases it governs.
 * When a preposition is followed by a noun in one of these cases,
 * we can be confident it's being used as a preposition.
 *
 * Source: Greynir's Prepositions.conf
 */
export const PREPOSITION_CASES: Map<string, Set<GrammaticalCase>> = new Map<string, Set<GrammaticalCase>>([
  // Both accusative and dative
  ["á", new Set<GrammaticalCase>(["þf", "þgf"])], // on/at (þf=direction, þgf=location)
  ["í", new Set<GrammaticalCase>(["þf", "þgf"])], // in (þf=into, þgf=inside)
  ["við", new Set<GrammaticalCase>(["þf", "þgf"])], // at/by (þf=against, þgf=near)
  ["með", new Set<GrammaticalCase>(["þf", "þgf"])], // with (þf=bring, þgf=accompany)
  ["undir", new Set<GrammaticalCase>(["þf", "þgf"])], // under (þf=motion, þgf=position)
  ["yfir", new Set<GrammaticalCase>(["þf", "þgf"])], // over (þf=motion, þgf=position)
  ["fyrir", new Set<GrammaticalCase>(["þf", "þgf"])], // for/before (þf=in exchange, þgf=in front)

  // Accusative only
  ["um", new Set<GrammaticalCase>(["þf"])], // about/around
  ["gegnum", new Set<GrammaticalCase>(["þf"])], // through
  ["kringum", new Set<GrammaticalCase>(["þf"])], // around
  ["umhverfis", new Set<GrammaticalCase>(["þf"])], // around/surrounding

  // Dative only
  ["af", new Set<GrammaticalCase>(["þgf"])], // of/from
  ["frá", new Set<GrammaticalCase>(["þgf"])], // from
  ["hjá", new Set<GrammaticalCase>(["þgf"])], // at/with (someone's place)
  ["úr", new Set<GrammaticalCase>(["þgf"])], // out of
  ["að", new Set<GrammaticalCase>(["þgf"])], // to/at
  ["móti", new Set<GrammaticalCase>(["þgf"])], // against
  ["nálægt", new Set<GrammaticalCase>(["þgf"])], // near
  ["gegn", new Set<GrammaticalCase>(["þgf"])], // against
  ["gagnvart", new Set<GrammaticalCase>(["þgf"])], // towards/regarding
  ["handa", new Set<GrammaticalCase>(["þgf"])], // for (someone)
  ["meðal", new Set<GrammaticalCase>(["ef"])], // among (actually genitive)

  // Genitive only
  ["til", new Set<GrammaticalCase>(["ef"])], // to
  ["án", new Set<GrammaticalCase>(["ef"])], // without
  ["vegna", new Set<GrammaticalCase>(["ef"])], // because of
  ["sakir", new Set<GrammaticalCase>(["ef"])], // because of
  ["utan", new Set<GrammaticalCase>(["ef"])], // outside
  ["innan", new Set<GrammaticalCase>(["ef"])], // inside
  ["meðfram", new Set<GrammaticalCase>(["þgf"])], // along
  ["milli", new Set<GrammaticalCase>(["ef"])], // between
  ["auk", new Set<GrammaticalCase>(["ef"])], // in addition to
  ["í stað", new Set<GrammaticalCase>(["ef"])], // instead of
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
 * Apply noun-after-preposition rule to disambiguate.
 *
 * If the previous word is a preposition and the current word has a
 * noun candidate with a case governed by that preposition, prefer
 * the noun reading.
 *
 * This rule only applies when:
 * - The previous word is UNAMBIGUOUSLY a preposition (no pronoun reading), OR
 * - The current word has no verb candidate
 *
 * Example: "til fundar" → "fundar" is noun "fundur" (genitive), not verb "funda"
 * Counter-example: "við fórum" → "við" is pronoun, "fórum" is verb "fara"
 *
 * @param candidates - All possible readings of the current word
 * @param prevWord - The previous word (raw form)
 * @param lemmatizer - Lemmatizer for looking up the previous word
 * @returns GrammarRuleMatch if a rule applies, null otherwise
 */
export function applyNounAfterPrepositionRule(
  candidates: LemmaWithMorph[],
  prevWord: string | null,
  lemmatizer: GrammarLemmatizerLike | null
): GrammarRuleMatch | null {
  if (!prevWord || !lemmatizer?.lemmatizeWithPOS) return null;

  // Check if previous word is a preposition
  const prevLemmas = lemmatizer.lemmatizeWithPOS(prevWord);
  const prepCandidate = prevLemmas.find((l) => l.pos === "fs");
  if (!prepCandidate) return null;

  // Check if the previous word could also be a pronoun
  const hasPronounReading = prevLemmas.some((l) => l.pos === "fn");

  // Check if current word has a verb candidate
  const hasVerbCandidate = candidates.some((c) => c.pos === "so");

  // If prevWord is ambiguously pronoun/preposition AND current word can be a verb,
  // don't apply this rule (let pronoun+verb rule or bigrams handle it)
  if (hasPronounReading && hasVerbCandidate) {
    return null;
  }

  // Get cases this preposition governs
  const governedCases = PREPOSITION_CASES.get(prepCandidate.lemma);
  if (!governedCases) return null;

  // Find noun candidate with matching case
  const nounCandidates = candidates.filter((c) => c.pos === "no");
  for (const noun of nounCandidates) {
    if (noun.morph?.case && governedCases.has(noun.morph.case)) {
      return {
        lemma: noun.lemma,
        pos: "no",
        rule: `noun_after_prep+${noun.morph.case}`,
        confidence: 0.9,
      };
    }
  }

  return null;
}

/**
 * Apply subject-verb-object rule to disambiguate.
 *
 * When the previous word has a nominative reading (subject), the current word
 * is ambiguous between verb and preposition, and the next word is accusative,
 * prefer the verb reading. This handles patterns like:
 * - "Jón á bílinn" → á = eiga (Jón owns the car)
 * - "Barnið á leikfangið" → á = eiga (the child owns the toy)
 *
 * Key linguistic insight from Greynir: "á" + dative (þgf) is unambiguously
 * a preposition since "eiga" doesn't take dative objects. But "á" + accusative
 * (þf) is ambiguous — it could be the preposition (direction) or the verb
 * "eiga" (to own, with accusative object). A nominative subject tips the scale.
 *
 * @param candidates - All possible readings of the current word
 * @param prevWord - Previous word (raw form)
 * @param nextWordMorph - Morphological analyses of the next word
 * @param lemmatizer - Lemmatizer for looking up previous word morphology
 * @returns GrammarRuleMatch if a rule applies, null otherwise
 */
export function applySubjectVerbRule(
  candidates: LemmaWithMorph[],
  prevWord: string | null,
  nextWordMorph: LemmaWithMorph[],
  lemmatizer: GrammarLemmatizerLike | null,
  nextWord: string | null = null
): GrammarRuleMatch | null {
  if (!prevWord || !lemmatizer?.lemmatizeWithMorph) return null;
  if (!nextWord && nextWordMorph.length === 0) return null;

  // Only applies when current word has both verb and preposition candidates
  const verbCandidates = candidates.filter((c) => c.pos === "so");
  const prepCandidates = candidates.filter((c) => c.pos === "fs");
  if (verbCandidates.length === 0 || prepCandidates.length === 0) return null;

  // Determine next word's case — from morph data or suffix inference
  let nextHasDative = nextWordMorph.some((m) => m.morph?.case === "þgf");
  let nextHasNonDative = nextWordMorph.some(
    (m) => m.morph?.case && m.morph.case !== "þgf"
  );
  const nextIsNoun = nextWordMorph.some((m) => m.pos === "no");

  // If morph data lacks case info, infer from suffix
  if (!nextHasDative && !nextHasNonDative && nextWord) {
    const nextSuffixCases = inferCaseFromSuffix(nextWord);
    nextHasDative = nextSuffixCases.has("þgf");
    nextHasNonDative = nextSuffixCases.size > 0 && !nextSuffixCases.has("þgf")
      || (nextSuffixCases.size > 1); // has both dative and non-dative
    // If no suffix detected, bare noun — could be any case, allow the rule
    if (nextSuffixCases.size === 0 && nextIsNoun) {
      nextHasNonDative = true;
    }
  }

  // If next word is ONLY dative, "á" is unambiguously preposition — bail out
  if (nextHasDative && !nextHasNonDative) return null;

  // Next word must be a noun or part of a noun phrase (adjective, numeral)
  // "á stóran bát" → "stóran" is adjective modifying "bát"
  // "á þrjá hesta" → "þrjá" is numeral modifying "hesta"
  const nextIsNounPhrase = nextIsNoun
    || nextWordMorph.some((m) => m.pos === "lo" || m.pos === "to");
  if (!nextIsNounPhrase) return null;

  // Check if previous word is a confident nominative subject.
  const prevMorph = lemmatizer.lemmatizeWithMorph(prevWord);
  const prevHasNoun = prevMorph.some((m) => m.pos === "no");
  const prevHasVerb = prevMorph.some((m) => m.pos === "so");

  if (!prevHasNoun) return null;

  // Use morph case data if available
  let prevHasNominative = prevMorph.some(
    (m) => m.morph?.case === "nf" && (m.pos === "no" || m.pos === "fn")
  );

  // Fallback: infer from suffix if morph data lacks case
  if (!prevHasNominative) {
    const prevSuffixCases = inferCaseFromSuffix(prevWord);
    if (prevSuffixCases.has("nf")) {
      // Definite suffix like -inn/-ið/-nar confirms it's a noun
      // Even if it also has verb readings, the suffix is a strong noun signal
      prevHasNominative = true;
    } else if (prevSuffixCases.size === 0 && !prevHasVerb) {
      // Bare noun with NO verb readings (e.g., "pabbi", "Jón", "konráð")
      // Base form of nouns is nominative in Icelandic
      prevHasNominative = true;
    }
    // If bare noun WITH verb readings (e.g., "búa"), don't assume nominative
  }

  if (!prevHasNominative) return null;

  const eigaCandidate = verbCandidates.find((c) => c.lemma === "eiga");
  const verbCandidate = eigaCandidate ?? verbCandidates[0];

  return {
    lemma: verbCandidate.lemma,
    pos: "so",
    rule: "subject+verb+obj",
    confidence: 0.85,
  };
}

/**
 * Apply all mini-grammar rules in sequence.
 *
 * Rules are applied in order of specificity:
 * 1. Subject + verb + accusative object (nominative subject tips verb/prep ambiguity)
 * 2. Preposition + case government (most reliable for non-SVO patterns)
 * 3. Noun after preposition (governed case)
 * 4. Pronoun + verb pattern
 *
 * @param candidates - All possible readings of the current word
 * @param prevWord - Previous word (raw form)
 * @param nextWordMorph - Morphological analyses of the next word
 * @param lemmatizer - Optional lemmatizer for looking up previous word POS
 * @returns GrammarRuleMatch if any rule applies, null otherwise
 */
export function applyGrammarRules(
  candidates: LemmaWithMorph[],
  prevWord: string | null,
  nextWordMorph: LemmaWithMorph[],
  lemmatizer: GrammarLemmatizerLike | null = null,
  nextWord: string | null = null
): GrammarRuleMatch | null {
  // Rule 1: Subject (nominative) + verb + accusative object
  const svoRule = applySubjectVerbRule(candidates, prevWord, nextWordMorph, lemmatizer, nextWord);
  if (svoRule) return svoRule;

  // Rule 2: Preposition + governed case
  const prepRule = applyPrepositionRule(candidates, nextWordMorph);
  if (prepRule) return prepRule;

  // Rule 3: Noun after preposition with governed case
  const nounAfterPrepRule = applyNounAfterPrepositionRule(candidates, prevWord, lemmatizer);
  if (nounAfterPrepRule) return nounAfterPrepRule;

  // Rule 4: Pronoun + verb
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
