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
import { BloomFilter, type BloomFilterOptions } from "./bloom.js";

/**
 * Protected lemmas that should NEVER be split as compounds.
 * Mostly place names that happen to end in common word parts.
 */
export const PROTECTED_LEMMAS = new Set([
  // Countries ending in -land
  "ísland",
  "england",
  "írland",
  "skotland",
  "finnland",
  "grænland",
  "holland",
  "þýskaland",
  "frakkland",
  "pólland",
  "tékkland",
  "svissland",
  "rússland",
  "eistland",
  "lettland",
  "litháen",
  // Other countries/regions
  "danmörk",
  "noregur",
  "svíþjóð",
  "bandaríkin",
  "spánn",
  "portúgal",
  "ítalía",
  "grikkland",
  // Icelandic place names (from BÍN)
  "þingvellir",
  "akureyri",
  "ísafjörður",
  "reykjavík",
  "keflavík",
  "hafnarfjörður",
  "kópavogur",
  "seltjarnarnes",
  "garðabær",
  "mosfellsbær",
  "vestmannaeyjar",
  "húsavík",
  "sauðárkrókur",
  "siglufjörður",
  "ólafsfjörður",
  "dalvík",
  "egilsstaðir",
  "neskaupstaður",
  "seyðisfjörður",
  "eskifjörður",
  "reyðarfjörður",
  "fáskrúðsfjörður",
  "stöðvarfjörður",
  "djúpivogur",
  "höfn",
  "vík",
  "selfoss",
  "hveragerði",
  "þorlákshöfn",
  "grindavík",
  "sandgerði",
  "borgarnes",
  "stykkishólmur",
  "grundarfjörður",
  "ólafsvík",
  "búðardalur",
  "patreksfjörður",
  "flateyri",
  "suðureyri",
  "bolungarvík",
  "hólmavík",
  "hvammstangi",
  "blönduós",
  "skagaströnd",
  "varmahlíð",
  // Literary/historical places
  "hlíðarendi",
  "bergþórshvol",
  // Company names
  "íslandsbanki",
  "landsbankinn",
  "arionbanki",
  // Institutions
  "alþingi",
]);

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

/**
 * Splitting mode for compound words.
 *
 * - "aggressive": Try to split all words, even known BÍN entries
 * - "balanced": Split unknown words; split known words only if high confidence
 * - "conservative": Only split at hyphens or very high confidence cases
 */
export type CompoundSplitMode = "aggressive" | "balanced" | "conservative";

export interface CompoundSplitterOptions {
  /**
   * Minimum part length.
   * Default: 3. Set to 2 for more aggressive splitting (e.g., "ís" in "ísland").
   */
  minPartLength?: number;
  /** Try removing linking letters (s, u, a) */
  tryLinkingLetters?: boolean;
  /**
   * Splitting mode.
   * Default: "balanced"
   */
  mode?: CompoundSplitMode;
}

/**
 * Common compound tail words in Icelandic.
 * These are often the second part of compounds and boost split confidence.
 */
const COMMON_COMPOUND_TAILS = new Set([
  // People/roles
  "maður",
  "kona",
  "stjóri",
  "ráðherra",
  "forseti",
  "formaður",
  "fulltrúi",
  "starfsmaður",
  // Places
  "hús",
  "staður",
  "vegur",
  "borg",
  "bær",
  "dalur",
  "fjörður",
  // Organizations
  "félag",
  "banki",
  "sjóður",
  "stofnun",
  "ráð",
  // Things/concepts
  "rannsókn",
  "greiðsla",
  "mál",
  "kerfi",
  "verk",
  "þjónusta",
  "rekstur",
  "viðskipti",
  "verð",
  "kostnaður",
]);

/**
 * Very common standalone words that should rarely be compound parts.
 * Penalize splits where BOTH parts are common standalone words.
 */
const COMMON_STANDALONE = new Set([
  "vera",
  "hafa",
  "gera",
  "fara",
  "koma",
  "segja",
  "vilja",
  "mega",
  "þurfa",
  "verða",
  "geta",
  "sjá",
  "taka",
  "eiga",
  "láta",
  "halda",
  "leyfa",
  "búa",
]);

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
  private knownLemmas: KnownLemmaLookup;
  private mode: CompoundSplitMode;

  constructor(
    lemmatizer: LemmatizerLike,
    knownLemmas: KnownLemmaLookup,
    options: CompoundSplitterOptions = {}
  ) {
    this.lemmatizer = lemmatizer;
    this.knownLemmas = knownLemmas;
    this.minPartLength = options.minPartLength ?? 3;
    this.tryLinkingLetters = options.tryLinkingLetters ?? true;
    this.mode = options.mode ?? "balanced";
  }

  /**
   * Helper to create a no-split result.
   */
  private noSplit(word: string, lemmas: string[]): CompoundSplit {
    return {
      word,
      parts: lemmas,
      indexTerms: lemmas,
      confidence: 0,
      isCompound: false,
    };
  }

  /**
   * Try to split a word into compound parts.
   *
   * Uses a lookup-first strategy:
   * 1. Check protected lemmas - never split
   * 2. Check if word is known in BÍN and unambiguous - don't split
   * 3. Apply mode-based splitting rules
   */
  split(word: string): CompoundSplit {
    const normalized = word.toLowerCase();

    // Step 1: Check protected lemmas - never split these
    const directLemmas = this.lemmatizer.lemmatize(word);
    const primaryLemma = directLemmas[0]?.toLowerCase();
    if (primaryLemma && PROTECTED_LEMMAS.has(primaryLemma)) {
      return this.noSplit(word, directLemmas);
    }

    // Also check if the word itself is protected (for inflected forms)
    if (PROTECTED_LEMMAS.has(normalized)) {
      return this.noSplit(word, directLemmas);
    }

    // Step 2: Check if known in BÍN and unambiguous
    // A word is "known" if lemmatization returned something other than the word itself
    const isKnownWord =
      directLemmas.length > 0 && directLemmas[0].toLowerCase() !== normalized;
    const isUnambiguous = directLemmas.length === 1;

    // For conservative mode, only split at hyphens
    if (this.mode === "conservative") {
      if (word.includes("-")) {
        return this.splitAtHyphen(word, directLemmas);
      }
      return this.noSplit(word, directLemmas);
    }

    // For balanced mode, don't split unambiguous known words
    if (this.mode === "balanced" && isKnownWord && isUnambiguous) {
      // Exception: still try if the word is very long (likely a compound)
      if (normalized.length < 12) {
        return this.noSplit(word, directLemmas);
      }
    }

    // Too short to be a compound
    if (normalized.length < this.minPartLength * 2) {
      return this.noSplit(word, directLemmas);
    }

    // Step 3: Try algorithmic splitting
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
      return this.noSplit(word, directLemmas);
    }

    // Pick best candidate by score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // In balanced mode, require higher confidence for known words
    if (this.mode === "balanced" && isKnownWord && best.score < 0.6) {
      return this.noSplit(word, directLemmas);
    }

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

  /**
   * Split a hyphenated word.
   */
  private splitAtHyphen(word: string, directLemmas: string[]): CompoundSplit {
    const parts = word.split("-").filter((p) => p.length > 0);
    if (parts.length < 2) {
      return this.noSplit(word, directLemmas);
    }

    const allParts: string[] = [];
    for (const part of parts) {
      const lemmas = this.lemmatizer.lemmatize(part);
      allParts.push(...lemmas);
    }

    const uniqueParts = [...new Set(allParts)];
    const indexTerms = [...new Set([...uniqueParts, word.toLowerCase()])];

    return {
      word,
      parts: uniqueParts,
      indexTerms,
      confidence: 0.9,
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

    // Calculate score with multiple factors
    let score = 0;

    // Factor 1: Length balance (20% weight)
    // Prefer balanced splits, but not too strictly
    const lengthBalance =
      1 - Math.abs(leftPart.length - rightPart.length) / (leftPart.length + rightPart.length);
    score += lengthBalance * 0.2;

    // Factor 2: Part length bonus (20% weight)
    // Prefer longer parts (more likely to be real words)
    const avgLength = (leftPart.length + rightPart.length) / 2;
    const lengthBonus = Math.min(avgLength / 6, 1);
    score += lengthBonus * 0.2;

    // Factor 3: Common compound tail bonus (30% weight)
    // Strongly prefer splits where right part is a known compound tail
    const hasCompoundTail = rightKnown.some((lemma) => COMMON_COMPOUND_TAILS.has(lemma));
    if (hasCompoundTail) {
      score += 0.3;
    }

    // Factor 4: Penalty for both parts being common standalone words (30% weight)
    // E.g., "ísland" -> "ís" + "land" should be penalized
    const leftIsCommon = leftKnown.some((lemma) => COMMON_STANDALONE.has(lemma));
    const rightIsCommon = rightKnown.some((lemma) => COMMON_STANDALONE.has(lemma));
    if (leftIsCommon && rightIsCommon) {
      // Strong penalty if both parts are very common standalone
      score -= 0.3;
    } else if (!leftIsCommon && !rightIsCommon) {
      // Bonus if neither is a common standalone (more likely a real compound)
      score += 0.2;
    }

    // Factor 5: Minimum part length requirement
    // Very short parts (2-3 chars) get a penalty
    if (leftPart.length < 4 || rightPart.length < 4) {
      score -= 0.15;
    }

    // Return all known lemmas from both parts
    return {
      leftParts: leftKnown,
      rightParts: rightKnown,
      score: Math.max(0, score), // Ensure non-negative
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

export interface KnownLemmaLookup {
  has(lemma: string): boolean;
}

export interface KnownLemmaFilterOptions extends BloomFilterOptions {}

/**
 * Create a compact lookup for known lemmas using a Bloom filter.
 * False positives are possible (more splits), false negatives are not.
 */
export function createKnownLemmaFilter(
  lemmas: string[],
  options: KnownLemmaFilterOptions = {}
): KnownLemmaLookup {
  const normalized = lemmas.map((l) => l.toLowerCase());
  return BloomFilter.fromValues(normalized, options);
}
