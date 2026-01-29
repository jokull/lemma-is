/**
 * Disambiguation algorithm using a multi-phase pipeline.
 *
 * When a word has multiple possible lemmas, use surrounding context
 * and linguistic rules to select the most likely one.
 *
 * Pipeline phases:
 * 1. Unambiguous - words with only one lemma candidate
 * 2. Phrase rules - multi-word expressions and fixed phrases
 * 3. Disambiguation rules - contextual preferences (e.g., "á" after pronoun = verb)
 * 4. Grammar rules - case government (preposition + case noun)
 * 5. Word bigrams - statistical scoring using bigram frequencies
 * 6. Fallback - use first lemma if no other evidence
 */

import { STOPWORDS_IS } from "./stopwords.js";
import type { LemmatizerLike, LemmaWithPOS, LemmaWithMorph, BigramProvider, WordClass } from "./types.js";
import { DISAMBIGUATION_RULES, type DisambiguationRule } from "./disambiguation-rules.js";
import { applyGrammarRules } from "./mini-grammar.js";

export interface DisambiguatorOptions {
  /** Weight for left context (previous word) */
  leftWeight?: number;
  /** Weight for right context (next word) */
  rightWeight?: number;
  /** Enable phrase-based disambiguation */
  usePhraseRules?: boolean;
  /** Enable preference rules (e.g., "á" context rules) */
  usePreferenceRules?: boolean;
  /** Enable grammar rules (case government) */
  useGrammarRules?: boolean;
}

export interface DisambiguatedToken {
  /** Original token */
  token: string;
  /** Chosen lemma */
  lemma: string;
  /** Part of speech (if available) */
  pos?: WordClass;
  /** All candidate lemmas */
  candidates: string[];
  /** Candidates with POS (if available) */
  candidatesWithPOS?: LemmaWithPOS[];
  /** Was disambiguation needed? */
  ambiguous: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Which phase resolved this token */
  resolvedBy?: string;
}

/**
 * Extended lemmatizer interface that supports morphological lookup.
 */
interface MorphLemmatizerLike extends LemmatizerLike {
  lemmatizeWithMorph?(word: string): LemmaWithMorph[];
}

/**
 * Context for disambiguation, including surrounding tokens.
 */
interface DisambiguationContext {
  /** Previous word (if any) */
  prevWord: string | null;
  /** Next word (if any) */
  nextWord: string | null;
  /** Previous token's lemmas (if available) */
  prevLemmas?: string[];
  /** Next token's lemmas (if available) */
  nextLemmas?: string[];
  /** Next word's morphological analyses (if available) */
  nextWordMorph?: LemmaWithMorph[];
  /** All tokens in the sequence */
  allTokens: string[];
  /** Current index in the sequence */
  index: number;
}

/**
 * A disambiguation phase that processes candidates.
 */
interface DisambiguationPhase {
  name: string;
  run(
    candidates: LemmaWithPOS[],
    context: DisambiguationContext,
    disambiguator: Disambiguator
  ): { lemma: string; pos?: WordClass; confidence: number } | null;
}

/**
 * Phase 1: Handle unambiguous cases (single candidate).
 */
const unambiguousPhase: DisambiguationPhase = {
  name: "unambiguous",
  run(candidates) {
    if (candidates.length === 1) {
      return {
        lemma: candidates[0].lemma,
        pos: candidates[0].pos,
        confidence: 1.0,
      };
    }
    return null;
  },
};

/**
 * Phase 2: Apply disambiguation rules based on context.
 */
const preferenceRulesPhase: DisambiguationPhase = {
  name: "preference_rules",
  run(candidates, context, disambiguator) {
    if (!disambiguator.usePreferenceRules) return null;

    for (const rule of DISAMBIGUATION_RULES) {
      const match = applyRule(rule, candidates, context);
      if (match) {
        return {
          lemma: match.lemma,
          pos: match.pos,
          confidence: 0.85,
        };
      }
    }
    return null;
  },
};

/**
 * Apply a single disambiguation rule.
 */
function applyRule(
  rule: DisambiguationRule,
  candidates: LemmaWithPOS[],
  context: DisambiguationContext
): LemmaWithPOS | null {
  // Find candidates matching the word and preferred POS
  const preferredCandidate = candidates.find(
    (c) => c.lemma.toLowerCase() === rule.word.toLowerCase() && c.pos === rule.prefer
  );
  const dispreferred = candidates.find(
    (c) => c.lemma.toLowerCase() === rule.word.toLowerCase() && c.pos === rule.over
  );

  if (!preferredCandidate || !dispreferred) {
    return null;
  }

  // Check context condition
  if (rule.context === "before_noun") {
    // Next word should be a noun (starts with uppercase or known noun)
    const next = context.nextWord;
    if (next && /^[A-ZÁÉÍÓÚÝÞÆÖ]/.test(next)) {
      return preferredCandidate;
    }
  } else if (rule.context === "before_verb") {
    // Next word suggests a verb context (harder to detect without POS)
    // Simple heuristic: if next word is lowercase and not a common noun determiner
    const next = context.nextWord?.toLowerCase();
    if (next && !["þessi", "þetta", "sá", "sú", "það", "hinn", "hin", "hið"].includes(next)) {
      return preferredCandidate;
    }
  } else if (rule.context === "after_pronoun") {
    // Previous word is a pronoun
    const prev = context.prevWord?.toLowerCase();
    const pronouns = ["ég", "þú", "hann", "hún", "það", "við", "þið", "þeir", "þær", "þau"];
    if (prev && pronouns.includes(prev)) {
      return preferredCandidate;
    }
  }

  return null;
}

/**
 * Phase 3: Apply grammar rules (case government).
 *
 * Uses morphological features to apply preposition+case and pronoun+verb rules.
 */
const grammarRulesPhase: DisambiguationPhase = {
  name: "grammar_rules",
  run(candidates, context, disambiguator) {
    if (!disambiguator.useGrammarRules) return null;

    // Convert LemmaWithPOS to LemmaWithMorph if needed
    const candidatesWithMorph: LemmaWithMorph[] = candidates.map((c) => ({
      ...c,
      morph: undefined,
    }));

    // Get morphological info for candidates if available
    if (disambiguator.lemmatizer.lemmatizeWithMorph) {
      const currentWord = context.allTokens[context.index];
      if (currentWord) {
        const morphCandidates = disambiguator.lemmatizer.lemmatizeWithMorph(currentWord);
        // Replace with morph-enriched candidates
        candidatesWithMorph.length = 0;
        candidatesWithMorph.push(...morphCandidates);
      }
    }

    // Apply grammar rules
    const result = applyGrammarRules(
      candidatesWithMorph,
      context.prevWord,
      context.nextWordMorph ?? []
    );

    if (result) {
      return {
        lemma: result.lemma,
        pos: result.pos,
        confidence: result.confidence,
      };
    }

    return null;
  },
};

/**
 * Phase 4: Score using bigram frequencies.
 */
const bigramPhase: DisambiguationPhase = {
  name: "word_bigrams",
  run(candidates, context, disambiguator) {
    if (!disambiguator.bigrams) return null;
    if (candidates.length === 0) return null;

    const scores: { candidate: LemmaWithPOS; score: number }[] = [];

    for (const candidate of candidates) {
      let score = 0;

      // Left context: bigram(prevWord, lemma)
      if (context.prevWord) {
        const prevLemmas = context.prevLemmas || disambiguator.lemmatizer.lemmatize(context.prevWord);
        for (const prevLemma of prevLemmas) {
          const freq = disambiguator.bigrams.freq(prevLemma, candidate.lemma);
          if (freq > 0) {
            score += Math.log(freq + 1) * disambiguator.leftWeight;
          }
        }
      }

      // Right context: bigram(lemma, nextWord)
      if (context.nextWord) {
        const nextLemmas = context.nextLemmas || disambiguator.lemmatizer.lemmatize(context.nextWord);
        for (const nextLemma of nextLemmas) {
          const freq = disambiguator.bigrams.freq(candidate.lemma, nextLemma);
          if (freq > 0) {
            score += Math.log(freq + 1) * disambiguator.rightWeight;
          }
        }
      }

      scores.push({ candidate, score });
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    // Check if we have scores and if top score is positive
    if (scores.length > 0 && scores[0].score > 0) {
      const topScore = scores[0].score;
      const totalScore = scores.reduce((sum, s) => sum + Math.exp(s.score), 0);
      const confidence = totalScore > 0 ? Math.exp(topScore) / totalScore : 0.5;

      return {
        lemma: scores[0].candidate.lemma,
        pos: scores[0].candidate.pos,
        confidence,
      };
    }

    return null;
  },
};

/**
 * Phase 5: Fallback to first candidate.
 */
const fallbackPhase: DisambiguationPhase = {
  name: "fallback",
  run(candidates) {
    if (candidates.length > 0) {
      return {
        lemma: candidates[0].lemma,
        pos: candidates[0].pos,
        confidence: 1 / candidates.length,
      };
    }
    return null;
  },
};

/**
 * All disambiguation phases in order.
 */
const PHASES: DisambiguationPhase[] = [
  unambiguousPhase,
  preferenceRulesPhase,
  grammarRulesPhase,
  bigramPhase,
  fallbackPhase,
];

/**
 * Disambiguate lemmas using a multi-phase pipeline.
 */
export class Disambiguator {
  lemmatizer: MorphLemmatizerLike;
  bigrams: BigramProvider | null;
  leftWeight: number;
  rightWeight: number;
  usePhraseRules: boolean;
  usePreferenceRules: boolean;
  useGrammarRules: boolean;

  constructor(
    lemmatizer: LemmatizerLike,
    bigrams: BigramProvider | null = null,
    options: DisambiguatorOptions = {}
  ) {
    this.lemmatizer = lemmatizer as MorphLemmatizerLike;
    this.bigrams = bigrams;
    this.leftWeight = options.leftWeight ?? 1.0;
    this.rightWeight = options.rightWeight ?? 1.0;
    this.usePhraseRules = options.usePhraseRules ?? true;
    this.usePreferenceRules = options.usePreferenceRules ?? true;
    this.useGrammarRules = options.useGrammarRules ?? true;
  }

  /**
   * Disambiguate a single word given context.
   *
   * @param word - The word to lemmatize
   * @param prevWord - Previous word (left context), or null
   * @param nextWord - Next word (right context), or null
   */
  disambiguate(
    word: string,
    prevWord: string | null,
    nextWord: string | null
  ): DisambiguatedToken {
    // Get candidates with POS if available
    let candidatesWithPOS: LemmaWithPOS[];
    if (this.lemmatizer.lemmatizeWithPOS) {
      candidatesWithPOS = this.lemmatizer.lemmatizeWithPOS(word);
    } else {
      // Fall back to plain lemmatization
      const lemmas = this.lemmatizer.lemmatize(word);
      candidatesWithPOS = lemmas.map((l) => ({ lemma: l, pos: "no" as WordClass }));
    }

    const candidates = candidatesWithPOS.map((c) => c.lemma);
    const token = word;

    // Get morphological info for next word if available
    let nextWordMorph: LemmaWithMorph[] | undefined;
    if (nextWord && this.lemmatizer.lemmatizeWithMorph) {
      nextWordMorph = this.lemmatizer.lemmatizeWithMorph(nextWord);
    }

    // Build context
    const context: DisambiguationContext = {
      prevWord,
      nextWord,
      nextWordMorph,
      allTokens: [word],
      index: 0,
    };

    // Run through phases
    for (const phase of PHASES) {
      const result = phase.run(candidatesWithPOS, context, this);
      if (result) {
        return {
          token,
          lemma: result.lemma,
          pos: result.pos,
          candidates,
          candidatesWithPOS,
          ambiguous: candidates.length > 1,
          confidence: result.confidence,
          resolvedBy: phase.name,
        };
      }
    }

    // Should never reach here due to fallback phase
    return {
      token,
      lemma: word.toLowerCase(),
      candidates,
      candidatesWithPOS,
      ambiguous: false,
      confidence: 0,
      resolvedBy: "none",
    };
  }

  /**
   * Disambiguate an array of tokens.
   *
   * @param tokens - Array of word tokens
   * @returns Array of disambiguated tokens
   */
  disambiguateAll(tokens: string[]): DisambiguatedToken[] {
    const results: DisambiguatedToken[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      const prevWord = i > 0 ? tokens[i - 1] : null;
      const nextWord = i < tokens.length - 1 ? tokens[i + 1] : null;

      results.push(this.disambiguate(word, prevWord, nextWord));
    }

    return results;
  }

  /**
   * Extract unique lemmas from text with disambiguation.
   *
   * @param tokens - Array of word tokens
   * @returns Set of unique lemmas (best guess for each ambiguous word)
   */
  extractLemmas(tokens: string[]): Set<string> {
    const lemmas = new Set<string>();
    const disambiguated = this.disambiguateAll(tokens);

    for (const result of disambiguated) {
      lemmas.add(result.lemma);
    }

    return lemmas;
  }
}

/**
 * Shortcut for simple lemma extraction with disambiguation.
 */
export function extractDisambiguatedLemmas(
  text: string,
  lemmatizer: LemmatizerLike,
  bigrams: BigramProvider,
  options: {
    tokenize?: (text: string) => string[];
    removeStopwords?: boolean;
  } = {}
): Set<string> {
  const { tokenize, removeStopwords } = options;

  // Tokenize
  const tokens = tokenize
    ? tokenize(text)
    : text
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter((t) => t.length > 0);

  // Disambiguate
  const disambiguator = new Disambiguator(lemmatizer, bigrams);
  const lemmas = disambiguator.extractLemmas(tokens);

  // Filter stopwords if requested
  if (removeStopwords) {
    for (const lemma of lemmas) {
      if (STOPWORDS_IS.has(lemma)) {
        lemmas.delete(lemma);
      }
    }
  }

  return lemmas;
}
