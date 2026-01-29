/**
 * Unified text processing pipeline integrating tokenize-is with lemmatization.
 *
 * Provides proper tokenization that handles Icelandic-specific patterns
 * (abbreviations, dates, times, etc.) before lemmatization.
 */

import { tokenize, type Token } from "tokenize-is";
import { Disambiguator, type DisambiguatedToken } from "./disambiguate.js";
import { CompoundSplitter, type CompoundSplit } from "./compounds.js";
import { STOPWORDS_IS, isContextualStopword } from "./stopwords.js";
import type { LemmatizerLike, BigramProvider } from "./types.js";

/**
 * Token kinds that should be lemmatized.
 */
const LEMMATIZABLE_KINDS = new Set(["word"]);

/**
 * Token kinds that represent named entities (skip lemmatization).
 */
const ENTITY_KINDS = new Set(["person", "company", "entity"]);

/**
 * Token kinds to skip entirely (not useful for indexing).
 */
const SKIP_KINDS = new Set([
  "punctuation",
  "s_begin",
  "s_end",
  "s_split",
  "unknown",
]);

/**
 * A processed token with lemmatization results.
 */
export interface ProcessedToken {
  /** Original token text */
  original: string;
  /** Token kind from tokenize-is */
  kind: string;
  /** Candidate lemmas (for word tokens) */
  lemmas: string[];
  /** Is this a named entity? */
  isEntity: boolean;
  /** Best lemma guess after disambiguation */
  disambiguated?: string;
  /** Disambiguation confidence (0-1) */
  confidence?: number;
  /** Compound split result if applicable */
  compoundSplit?: CompoundSplit;
}

/**
 * Options for text processing.
 */
export interface ProcessOptions {
  /** Bigram provider for disambiguation */
  bigrams?: BigramProvider;
  /** Compound splitter for compound word detection */
  compoundSplitter?: CompoundSplitter;
  /** Remove stopwords from results */
  removeStopwords?: boolean;
  /**
   * Use contextual stopword detection (requires POS info).
   * When true, words like "á" are only filtered as stopwords when used
   * as prepositions, not when used as verbs ("eiga") or nouns (river).
   * Default: false (use simple stopword list)
   */
  useContextualStopwords?: boolean;
  /** Include numbers in results */
  includeNumbers?: boolean;
  /**
   * Index all candidate lemmas, not just the disambiguated one.
   * Better recall for search (finds more matches), worse precision.
   * Set to false if you only want the most likely lemma.
   * Default: true
   */
  indexAllCandidates?: boolean;
  /**
   * Try compound splitting even for known words.
   * Useful when BÍN contains the compound but you still want parts indexed.
   * Set to false to only split unknown words.
   * Default: true
   */
  alwaysTryCompounds?: boolean;
}

/**
 * Process text through the full pipeline.
 *
 * @param text - Input text
 * @param lemmatizer - Lemmatizer instance
 * @param options - Processing options
 * @returns Array of processed tokens
 */
export function processText(
  text: string,
  lemmatizer: LemmatizerLike,
  options: ProcessOptions = {}
): ProcessedToken[] {
  const {
    bigrams,
    compoundSplitter,
    includeNumbers = false,
    alwaysTryCompounds = true,
  } = options;

  // Step 1: Tokenize
  const tokens = tokenize(text);

  // Step 2: Process each token
  const results: ProcessedToken[] = [];
  const wordTokens: { index: number; token: Token }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip unwanted tokens
    if (SKIP_KINDS.has(token.kind)) {
      continue;
    }

    // Handle named entities
    if (ENTITY_KINDS.has(token.kind)) {
      results.push({
        original: token.text ?? "",
        kind: token.kind,
        lemmas: [],
        isEntity: true,
      });
      continue;
    }

    // Handle numbers if requested
    if (token.kind === "number" || token.kind === "ordinal") {
      if (includeNumbers) {
        results.push({
          original: token.text ?? "",
          kind: token.kind,
          lemmas: [],
          isEntity: false,
        });
      }
      continue;
    }

    // Handle word tokens
    if (LEMMATIZABLE_KINDS.has(token.kind)) {
      const tokenText = token.text ?? "";
      const lemmas = lemmatizer.lemmatize(tokenText);

      const processed: ProcessedToken = {
        original: tokenText,
        kind: token.kind,
        lemmas,
        isEntity: false,
      };

      // Try compound splitting
      // - Always if alwaysTryCompounds is set (for better search recall)
      // - Otherwise only if lemmatization returns unknown word
      const isUnknownWord = lemmas.length === 1 && lemmas[0] === tokenText.toLowerCase();
      if (compoundSplitter && (alwaysTryCompounds || isUnknownWord)) {
        const split = compoundSplitter.split(tokenText);
        if (split.isCompound) {
          processed.compoundSplit = split;
          // Add component lemmas from parts (in addition to direct lemmas)
          const partLemmas = split.parts.flatMap((c) => lemmatizer.lemmatize(c));
          processed.lemmas = [...new Set([...lemmas, ...partLemmas])];
        }
      }

      results.push(processed);
      wordTokens.push({ index: results.length - 1, token });
      continue;
    }

    // Pass through other tokens (time, date, url, etc.)
    results.push({
      original: token.text ?? "",
      kind: token.kind,
      lemmas: [],
      isEntity: false,
    });
  }

  // Step 3: Disambiguate if we have bigram data
  if (bigrams && wordTokens.length > 0) {
    const disambiguator = new Disambiguator(lemmatizer, bigrams);

    for (let i = 0; i < wordTokens.length; i++) {
      const { index, token } = wordTokens[i];
      const prevToken = i > 0 ? wordTokens[i - 1].token : null;
      const nextToken = i < wordTokens.length - 1 ? wordTokens[i + 1].token : null;

      const result = disambiguator.disambiguate(
        token.text ?? "",
        prevToken?.text ?? null,
        nextToken?.text ?? null
      );

      results[index].disambiguated = result.lemma;
      results[index].confidence = result.confidence;
    }
  } else {
    // No disambiguation - use first lemma
    for (const { index } of wordTokens) {
      const processed = results[index];
      if (processed.lemmas.length > 0) {
        processed.disambiguated = processed.lemmas[0];
        processed.confidence = processed.lemmas.length === 1 ? 1.0 : 0.5;
      }
    }
  }

  return results;
}

/**
 * Extract unique indexable lemmas from text.
 *
 * @param text - Input text
 * @param lemmatizer - Lemmatizer instance
 * @param options - Processing options
 * @returns Set of unique lemmas suitable for search indexing
 */
export function extractIndexableLemmas(
  text: string,
  lemmatizer: LemmatizerLike,
  options: ProcessOptions = {}
): Set<string> {
  const {
    removeStopwords = false,
    indexAllCandidates = true,
    useContextualStopwords = false,
  } = options;

  const processed = processText(text, lemmatizer, options);
  const lemmas = new Set<string>();

  /**
   * Check if a lemma should be filtered as a stopword.
   * Uses contextual rules when enabled and POS is available.
   */
  const shouldFilter = (lemma: string, pos?: string): boolean => {
    if (!removeStopwords) return false;
    if (useContextualStopwords) {
      return isContextualStopword(lemma, pos);
    }
    return STOPWORDS_IS.has(lemma);
  };

  for (const token of processed) {
    // Skip entities
    if (token.isEntity) {
      continue;
    }

    if (indexAllCandidates) {
      // Index ALL candidate lemmas for better search recall
      for (const lemma of token.lemmas) {
        if (!shouldFilter(lemma)) {
          lemmas.add(lemma);
        }
      }
    } else {
      // Use disambiguated lemma if available (better precision)
      if (token.disambiguated) {
        // Note: We don't have POS info easily available in disambiguated result
        // This would need enhancement to pass through POS from disambiguation
        if (!shouldFilter(token.disambiguated)) {
          lemmas.add(token.disambiguated);
        }
      }
    }

    // Also add compound parts if split
    if (token.compoundSplit?.isCompound) {
      for (const part of token.compoundSplit.parts) {
        const partLemmas = lemmatizer.lemmatize(part);
        for (const lemma of partLemmas) {
          if (!shouldFilter(lemma)) {
            lemmas.add(lemma);
          }
        }
      }
    }
  }

  return lemmas;
}

/**
 * Strategy for benchmark comparisons.
 */
export type ProcessingStrategy = "naive" | "tokenized" | "disambiguated" | "full";

/**
 * Metrics from processing a text.
 */
export interface ProcessingMetrics {
  /** Total word count */
  wordCount: number;
  /** Words successfully lemmatized (not returned as-is) */
  lemmatizedCount: number;
  /** Coverage: lemmatized / total */
  coverage: number;
  /** Words with multiple candidate lemmas */
  ambiguousCount: number;
  /** Ambiguity rate: ambiguous / total */
  ambiguityRate: number;
  /** Average disambiguation confidence */
  avgConfidence: number;
  /** Compounds detected and split */
  compoundsFound: number;
  /** Named entities skipped */
  entitiesSkipped: number;
  /** Unique lemmas extracted */
  uniqueLemmas: number;
  /** Processing time in milliseconds */
  timeMs: number;
}

/**
 * Run benchmark with a specific strategy and collect metrics.
 */
export function runBenchmark(
  text: string,
  lemmatizer: LemmatizerLike,
  strategy: ProcessingStrategy,
  resources: {
    bigrams?: BigramProvider;
    compoundSplitter?: CompoundSplitter;
  } = {}
): ProcessingMetrics {
  const start = performance.now();

  let processed: ProcessedToken[];
  let lemmas: Set<string>;

  switch (strategy) {
    case "naive": {
      // Simple whitespace split + lemmatize
      const tokens = text.split(/\s+/).filter((t) => t.length > 0);
      const naiveProcessed: ProcessedToken[] = [];

      for (const token of tokens) {
        const cleaned = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        if (cleaned) {
          const tokenLemmas = lemmatizer.lemmatize(cleaned);
          naiveProcessed.push({
            original: cleaned,
            kind: "word",
            lemmas: tokenLemmas,
            isEntity: false,
            disambiguated: tokenLemmas[0],
            confidence: tokenLemmas.length === 1 ? 1.0 : 0.5,
          });
        }
      }
      processed = naiveProcessed;
      lemmas = new Set(naiveProcessed.map((p) => p.disambiguated!).filter(Boolean));
      break;
    }

    case "tokenized": {
      // tokenize-is + lemmatize word tokens
      processed = processText(text, lemmatizer);
      lemmas = new Set(
        processed
          .filter((p) => p.kind === "word" && p.lemmas.length > 0)
          .map((p) => p.lemmas[0])
      );
      break;
    }

    case "disambiguated": {
      // tokenized + bigram disambiguation
      processed = processText(text, lemmatizer, {
        bigrams: resources.bigrams,
      });
      lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: resources.bigrams,
      });
      break;
    }

    case "full": {
      // disambiguated + compounds
      processed = processText(text, lemmatizer, {
        bigrams: resources.bigrams,
        compoundSplitter: resources.compoundSplitter,
      });
      lemmas = extractIndexableLemmas(text, lemmatizer, {
        bigrams: resources.bigrams,
        compoundSplitter: resources.compoundSplitter,
      });
      break;
    }
  }

  const timeMs = performance.now() - start;

  // Calculate metrics
  const wordTokens = processed.filter((p) => p.kind === "word");
  const wordCount = wordTokens.length;

  const lemmatizedCount = wordTokens.filter((p) => {
    // Considered lemmatized if not returned as-is
    return (
      p.lemmas.length > 0 &&
      !(p.lemmas.length === 1 && p.lemmas[0] === p.original.toLowerCase())
    );
  }).length;

  const ambiguousCount = wordTokens.filter((p) => p.lemmas.length > 1).length;

  const confidences = wordTokens
    .filter((p) => p.confidence !== undefined)
    .map((p) => p.confidence!);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  const compoundsFound = wordTokens.filter((p) => p.compoundSplit?.isCompound).length;
  const entitiesSkipped = processed.filter((p) => p.isEntity).length;

  return {
    wordCount,
    lemmatizedCount,
    coverage: wordCount > 0 ? lemmatizedCount / wordCount : 0,
    ambiguousCount,
    ambiguityRate: wordCount > 0 ? ambiguousCount / wordCount : 0,
    avgConfidence,
    compoundsFound,
    entitiesSkipped,
    uniqueLemmas: lemmas.size,
    timeMs,
  };
}
