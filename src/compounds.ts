/**
 * Compound word splitting for Icelandic.
 *
 * Icelandic compounds are written as single words:
 * - "bílstjóri" = "bíl" (car) + "stjóri" (driver)
 * - "sjúkrahús" = "sjúkra" (sick-GEN) + "hús" (house)
 *
 * Strategy:
 * 1. Try splitting at each position
 * 2. Check if both parts are known words
 * 3. Handle common compound linking letters (s, u, a)
 * 4. Score by part lengths (prefer balanced splits)
 */

import type { LemmatizerLike } from "./types.js";

export interface CompoundSplit {
  /** Original word */
  word: string;
  /** Constituent parts (lemmatized) - all variants for indexing */
  parts: string[];
  /** All index terms: parts + original word */
  indexTerms: string[];
  /** Split confidence (0-1) */
  confidence: number;
  /** Is this a compound? */
  isCompound: boolean;
}

export interface CompoundSplitterOptions {
  /** Minimum part length */
  minPartLength?: number;
  /** Try removing linking letters (s, u, a) */
  tryLinkingLetters?: boolean;
}

/**
 * Common compound linking patterns in Icelandic.
 * These letters often join compound parts:
 * - "s" (genitive): húss + eigandi -> "húseigandi"
 * - "u" (genitive/linking): vatnu + fall -> "vatnufall" (rare)
 * - "a" (genitive): daga + blað -> "dagablað"
 */
const LINKING_PATTERNS = ["s", "u", "a"];

export class CompoundSplitter {
  private lemmatizer: LemmatizerLike;
  private minPartLength: number;
  private tryLinkingLetters: boolean;
  private knownLemmas: Set<string>;

  constructor(
    lemmatizer: LemmatizerLike,
    knownLemmas: Set<string>,
    options: CompoundSplitterOptions = {}
  ) {
    this.lemmatizer = lemmatizer;
    this.knownLemmas = knownLemmas;
    this.minPartLength = options.minPartLength ?? 3;
    this.tryLinkingLetters = options.tryLinkingLetters ?? true;
  }

  /**
   * Try to split a word into compound parts.
   */
  split(word: string): CompoundSplit {
    const normalized = word.toLowerCase();

    // Too short to be a compound
    if (normalized.length < this.minPartLength * 2) {
      const directLemmas = this.lemmatizer.lemmatize(word);
      return {
        word,
        parts: directLemmas,
        indexTerms: directLemmas,
        confidence: 0,
        isCompound: false,
      };
    }

    // Try all split positions
    const candidates: {
      leftParts: string[];
      rightParts: string[];
      score: number;
    }[] = [];

    for (
      let i = this.minPartLength;
      i <= normalized.length - this.minPartLength;
      i++
    ) {
      const leftPart = normalized.slice(0, i);
      const rightPart = normalized.slice(i);

      // Try direct split
      const directResult = this.trySplit(leftPart, rightPart);
      if (directResult) {
        candidates.push(directResult);
      }

      // Try with linking letters removed from split point
      if (this.tryLinkingLetters) {
        for (const linker of LINKING_PATTERNS) {
          // Remove linking letter from end of left part
          if (leftPart.endsWith(linker) && leftPart.length > this.minPartLength) {
            const trimmedLeft = leftPart.slice(0, -1);
            const result = this.trySplit(trimmedLeft, rightPart);
            if (result) {
              // Slightly lower score for linked compounds
              candidates.push({ ...result, score: result.score * 0.95 });
            }
          }
        }
      }
    }

    if (candidates.length === 0) {
      const directLemmas = this.lemmatizer.lemmatize(word);
      return {
        word,
        parts: directLemmas,
        indexTerms: directLemmas,
        confidence: 0,
        isCompound: false,
      };
    }

    // Pick best candidate by score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // Collect all unique parts from best split
    const parts = [...new Set([...best.leftParts, ...best.rightParts])];
    // Index terms include parts + original word for search
    const indexTerms = [...new Set([...parts, normalized])];

    return {
      word,
      parts,
      indexTerms,
      confidence: Math.min(best.score, 1),
      isCompound: true,
    };
  }

  private trySplit(
    leftPart: string,
    rightPart: string
  ): { leftParts: string[]; rightParts: string[]; score: number } | null {
    // Get lemmas for both parts
    const leftLemmas = this.lemmatizer.lemmatize(leftPart);
    const rightLemmas = this.lemmatizer.lemmatize(rightPart);

    // Filter to known lemmas only, deduplicated
    const leftKnown = [...new Set(leftLemmas.filter((l) => this.knownLemmas.has(l)))];
    const rightKnown = [...new Set(rightLemmas.filter((l) => this.knownLemmas.has(l)))];

    if (leftKnown.length === 0 || rightKnown.length === 0) {
      return null;
    }

    // Score: prefer balanced splits and longer parts
    const lengthBalance =
      1 - Math.abs(leftPart.length - rightPart.length) / (leftPart.length + rightPart.length);
    const avgLength = (leftPart.length + rightPart.length) / 2;
    const lengthBonus = Math.min(avgLength / 5, 1); // Bonus for longer parts

    const score = lengthBalance * 0.5 + lengthBonus * 0.5;

    // Return all known lemmas from both parts
    return {
      leftParts: leftKnown,
      rightParts: rightKnown,
      score,
    };
  }

  /**
   * Get all lemmas for a word, including compound parts.
   * Useful for search indexing.
   */
  getAllLemmas(word: string): string[] {
    const split = this.split(word);
    return split.indexTerms;
  }
}

/**
 * Create a set of known lemmas from the lemmatizer.
 * This is used to check if compound parts are valid words.
 */
export function createKnownLemmaSet(lemmas: string[]): Set<string> {
  return new Set(lemmas.map((l) => l.toLowerCase()));
}
