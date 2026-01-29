/**
 * Disambiguation algorithm using bigram frequencies and unigram fallback.
 *
 * When a word has multiple possible lemmas, use surrounding context
 * (bigrams) to select the most likely one.
 *
 * Strategy:
 * 1. For each candidate lemma, score based on bigram with previous/next word
 * 2. Prefer higher frequency bigrams
 * 3. Fall back to unigram frequency if no bigram match
 * 4. Fall back to first lemma if no frequency data available
 */

import { BigramLookup } from "./bigrams.js";
import { UnigramLookup } from "./unigrams.js";
import { STOPWORDS_IS } from "./stopwords.js";
import type { LemmatizerLike } from "./types.js";

export interface DisambiguatorOptions {
  /** Weight for left context (previous word) */
  leftWeight?: number;
  /** Weight for right context (next word) */
  rightWeight?: number;
  /** Unigram lookup for fallback scoring */
  unigrams?: UnigramLookup;
}

export interface DisambiguatedToken {
  /** Original token */
  token: string;
  /** Chosen lemma */
  lemma: string;
  /** All candidate lemmas */
  candidates: string[];
  /** Was disambiguation needed? */
  ambiguous: boolean;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Disambiguate lemmas using bigram context and unigram fallback.
 */
export class Disambiguator {
  private lemmatizer: LemmatizerLike;
  private bigrams: BigramLookup;
  private unigrams: UnigramLookup | null;
  private leftWeight: number;
  private rightWeight: number;

  constructor(
    lemmatizer: LemmatizerLike,
    bigrams: BigramLookup,
    options: DisambiguatorOptions = {}
  ) {
    this.lemmatizer = lemmatizer;
    this.bigrams = bigrams;
    this.unigrams = options.unigrams ?? null;
    this.leftWeight = options.leftWeight ?? 1.0;
    this.rightWeight = options.rightWeight ?? 1.0;
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
    const candidates = this.lemmatizer.lemmatize(word);
    const token = word;

    // No disambiguation needed
    if (candidates.length === 1) {
      return {
        token,
        lemma: candidates[0],
        candidates,
        ambiguous: false,
        confidence: 1.0,
      };
    }

    // Score each candidate
    const scores: { lemma: string; bigramScore: number; unigramScore: number }[] = [];

    for (const lemma of candidates) {
      let bigramScore = 0;

      // Left context: bigram(prevWord, lemma)
      if (prevWord) {
        const prevLemmas = this.lemmatizer.lemmatize(prevWord);
        for (const prevLemma of prevLemmas) {
          const freq = this.bigrams.freq(prevLemma, lemma);
          if (freq > 0) {
            bigramScore += Math.log(freq + 1) * this.leftWeight;
          }
        }
      }

      // Right context: bigram(lemma, nextWord)
      if (nextWord) {
        const nextLemmas = this.lemmatizer.lemmatize(nextWord);
        for (const nextLemma of nextLemmas) {
          const freq = this.bigrams.freq(lemma, nextLemma);
          if (freq > 0) {
            bigramScore += Math.log(freq + 1) * this.rightWeight;
          }
        }
      }

      // Unigram fallback score
      const unigramScore = this.unigrams
        ? Math.log(this.unigrams.freq(lemma) + 1)
        : 0;

      scores.push({ lemma, bigramScore, unigramScore });
    }

    // Sort by bigram score first, then unigram score as tiebreaker
    scores.sort((a, b) => {
      // Primary: bigram score
      if (a.bigramScore !== b.bigramScore) {
        return b.bigramScore - a.bigramScore;
      }
      // Secondary: unigram score
      return b.unigramScore - a.unigramScore;
    });

    // Check if we had any bigram evidence
    const hasBigramEvidence = scores[0].bigramScore > 0;

    // Calculate confidence
    let confidence: number;
    if (hasBigramEvidence) {
      // High confidence when bigrams agree
      const topScore = scores[0].bigramScore;
      const totalScore = scores.reduce((sum, s) => sum + Math.exp(s.bigramScore), 0);
      confidence = totalScore > 0 ? Math.exp(topScore) / totalScore : 1 / candidates.length;
    } else if (this.unigrams && scores[0].unigramScore > 0) {
      // Medium confidence when relying on unigrams
      const topScore = scores[0].unigramScore;
      const totalScore = scores.reduce((sum, s) => sum + Math.exp(s.unigramScore), 0);
      confidence = Math.min(
        0.7, // Cap unigram-only confidence
        totalScore > 0 ? Math.exp(topScore) / totalScore : 1 / candidates.length
      );
    } else {
      // Low confidence when no frequency data
      confidence = 1 / candidates.length;
    }

    return {
      token,
      lemma: scores[0].lemma,
      candidates,
      ambiguous: true,
      confidence,
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
  bigrams: BigramLookup,
  options: {
    tokenize?: (text: string) => string[];
    removeStopwords?: boolean;
    unigrams?: UnigramLookup;
  } = {}
): Set<string> {
  const { tokenize, removeStopwords, unigrams } = options;

  // Tokenize
  const tokens = tokenize
    ? tokenize(text)
    : text
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter((t) => t.length > 0);

  // Disambiguate
  const disambiguator = new Disambiguator(lemmatizer, bigrams, { unigrams });
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
