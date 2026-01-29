import { STOPWORDS_IS, isStopword, removeStopwords } from "./stopwords.js";

export { STOPWORDS_IS, isStopword, removeStopwords };
export { BigramLookup } from "./bigrams.js";
export { UnigramLookup } from "./unigrams.js";
export {
  BinaryLemmatizer,
  type BinaryLemmatizerOptions,
  type BinaryLemmatizeOptions,
} from "./binary-lemmatizer.js";
export {
  Disambiguator,
  extractDisambiguatedLemmas,
  type DisambiguatorOptions,
  type DisambiguatedToken,
} from "./disambiguate.js";
export type {
  LemmatizerLike,
  LemmaWithPOS,
  WordClass,
} from "./types.js";
export { WORD_CLASS_NAMES, WORD_CLASS_NAMES_IS } from "./types.js";
export {
  CompoundSplitter,
  createKnownLemmaSet,
  type CompoundSplit,
  type CompoundSplitterOptions,
} from "./compounds.js";
export {
  processText,
  extractIndexableLemmas,
  runBenchmark,
  type ProcessedToken,
  type ProcessOptions,
  type ProcessingStrategy,
  type ProcessingMetrics,
} from "./pipeline.js";

import type { WordClass, LemmaWithPOS } from "./types.js";

/**
 * Icelandic word form to lemma lookup.
 *
 * Uses the BÍN (Beygingarlýsing íslensks nútímamáls) database to map
 * inflected Icelandic words to their base forms (lemmas).
 *
 * @example
 * ```ts
 * const lemmatizer = await Lemmatizer.load('/path/to/data/');
 * lemmatizer.lemmatize('við'); // ['við', 'ég', 'viður'] - sorted by frequency
 * lemmatizer.lemmatize('á', { wordClass: 'so' }); // ['eiga'] - only verbs
 * lemmatizer.lemmatizeWithPOS('hesti'); // [{ lemma: 'hestur', pos: 'no' }]
 * ```
 */

export interface LemmatizerOptions {
  /**
   * Custom fetch function for loading data files.
   * Useful for Node.js or custom loading strategies.
   */
  fetch?: typeof fetch;
}

export interface LemmatizeOptions {
  /**
   * Filter results to only return lemmas of this word class.
   */
  wordClass?: WordClass;
}

/**
 * Parsed lookup entry: lemma index and POS tag.
 */
interface LookupEntry {
  index: number;
  pos: string;
}

export class Lemmatizer {
  private lemmas: string[];
  private lookup: Map<string, LookupEntry[]>;

  private constructor(lemmas: string[], lookup: Map<string, LookupEntry[]>) {
    this.lemmas = lemmas;
    this.lookup = lookup;
  }

  /**
   * Load lemmatizer data from the specified base URL.
   *
   * @param baseUrl - URL prefix for data files (lemmas.txt.gz, lookup.tsv.gz)
   * @param options - Optional configuration
   * @returns Initialized Lemmatizer instance
   *
   * @example
   * ```ts
   * // Browser (files served from /data/)
   * const lemmatizer = await Lemmatizer.load('/data/');
   *
   * // Node.js with custom fetch
   * import { readFileSync } from 'fs';
   * import { gunzipSync } from 'zlib';
   *
   * const lemmatizer = await Lemmatizer.loadFromBuffers(
   *   gunzipSync(readFileSync('dist/lemmas.txt.gz')),
   *   gunzipSync(readFileSync('dist/lookup.tsv.gz'))
   * );
   * ```
   */
  static async load(
    baseUrl: string,
    options: LemmatizerOptions = {}
  ): Promise<Lemmatizer> {
    const fetchFn = options.fetch ?? fetch;

    // Ensure trailing slash
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

    // Load both files in parallel
    const [lemmasResponse, lookupResponse] = await Promise.all([
      fetchFn(`${base}lemmas.txt.gz`),
      fetchFn(`${base}lookup.tsv.gz`),
    ]);

    if (!lemmasResponse.ok) {
      throw new Error(`Failed to load lemmas.txt.gz: ${lemmasResponse.status}`);
    }
    if (!lookupResponse.ok) {
      throw new Error(`Failed to load lookup.tsv.gz: ${lookupResponse.status}`);
    }

    // Decompress using DecompressionStream (available in modern browsers and Node 18+)
    const lemmasStream = lemmasResponse.body?.pipeThrough(
      new DecompressionStream("gzip")
    );
    const lookupStream = lookupResponse.body?.pipeThrough(
      new DecompressionStream("gzip")
    );

    if (!lemmasStream || !lookupStream) {
      throw new Error("Response body is null");
    }

    const [lemmasText, lookupText] = await Promise.all([
      new Response(lemmasStream).text(),
      new Response(lookupStream).text(),
    ]);

    return Lemmatizer.loadFromStrings(lemmasText, lookupText);
  }

  /**
   * Load from already-decompressed string data.
   */
  static loadFromStrings(lemmasText: string, lookupText: string): Lemmatizer {
    const lemmas = lemmasText.split("\n").filter((l) => l.length > 0);
    const lookup = new Map<string, LookupEntry[]>();

    for (const line of lookupText.split("\n")) {
      if (!line) continue;
      const [word, entriesStr] = line.split("\t");
      if (word && entriesStr) {
        const entries: LookupEntry[] = [];
        for (const part of entriesStr.split(",")) {
          const colonIdx = part.indexOf(":");
          if (colonIdx !== -1) {
            const index = parseInt(part.slice(0, colonIdx), 10);
            const pos = part.slice(colonIdx + 1);
            entries.push({ index, pos });
          } else {
            // Legacy format without POS (backwards compat)
            entries.push({ index: parseInt(part, 10), pos: "" });
          }
        }
        lookup.set(word, entries);
      }
    }

    return new Lemmatizer(lemmas, lookup);
  }

  /**
   * Load from Buffer objects (for Node.js usage).
   */
  static loadFromBuffers(
    lemmasBuffer: Buffer | Uint8Array,
    lookupBuffer: Buffer | Uint8Array
  ): Lemmatizer {
    const decoder = new TextDecoder("utf-8");
    return Lemmatizer.loadFromStrings(
      decoder.decode(lemmasBuffer),
      decoder.decode(lookupBuffer)
    );
  }

  /**
   * Look up possible lemmas for a word form.
   * Results are sorted by corpus frequency (most common first).
   *
   * @param word - The inflected word form to look up
   * @param options - Optional filtering (e.g., by word class)
   * @returns Array of possible lemmas, or the word itself if not found
   *
   * @example
   * ```ts
   * lemmatizer.lemmatize('við'); // ['við', 'ég', 'viður']
   * lemmatizer.lemmatize('á', { wordClass: 'so' }); // ['eiga']
   * lemmatizer.lemmatize('á', { wordClass: 'fs' }); // ['á']
   * lemmatizer.lemmatize('unknown'); // ['unknown']
   * ```
   */
  lemmatize(word: string, options: LemmatizeOptions = {}): string[] {
    const normalized = word.toLowerCase();
    const entries = this.lookup.get(normalized);

    if (!entries) {
      // Word not in lookup table - return as-is
      return [normalized];
    }

    const { wordClass } = options;

    // Filter by word class if specified
    const filtered = wordClass
      ? entries.filter((e) => e.pos === wordClass)
      : entries;

    if (filtered.length === 0) {
      // No matches for filter - return word as-is
      return [normalized];
    }

    // Return lemmas (already sorted by frequency in data file)
    return filtered.map((e) => this.lemmas[e.index]);
  }

  /**
   * Look up lemmas with their word class (POS) tags.
   *
   * @param word - The inflected word form to look up
   * @returns Array of { lemma, pos } objects
   *
   * @example
   * ```ts
   * lemmatizer.lemmatizeWithPOS('á');
   * // [
   * //   { lemma: 'á', pos: 'ao' },
   * //   { lemma: 'á', pos: 'fs' },
   * //   { lemma: 'á', pos: 'no' },
   * //   { lemma: 'eiga', pos: 'so' },
   * // ]
   * ```
   */
  lemmatizeWithPOS(word: string): LemmaWithPOS[] {
    const normalized = word.toLowerCase();
    const entries = this.lookup.get(normalized);

    if (!entries) {
      return [];
    }

    return entries.map((e) => ({
      lemma: this.lemmas[e.index],
      pos: e.pos as WordClass,
    }));
  }

  /**
   * Check if a word is known to the lemmatizer.
   */
  isKnown(word: string): boolean {
    const normalized = word.toLowerCase();
    // Known if it's in lookup table OR it's a lemma
    return this.lookup.has(normalized) || this.lemmas.includes(normalized);
  }

  /**
   * Get the total number of lemmas in the database.
   */
  get lemmaCount(): number {
    return this.lemmas.length;
  }

  /**
   * Get the total number of word forms with explicit mappings.
   */
  get wordFormCount(): number {
    return this.lookup.size;
  }

  /**
   * Get the lemmas array (useful for compound splitting).
   */
  get allLemmas(): string[] {
    return this.lemmas;
  }
}

export interface ExtractOptions {
  /** Custom tokenizer function */
  tokenize?: (text: string) => string[];
  /** Remove stopwords from results (default: false) */
  removeStopwords?: boolean;
  /** Filter by word class */
  wordClass?: WordClass;
}

/**
 * Extract all unique lemmas from a text for search indexing.
 *
 * @param text - Input text
 * @param lemmatizer - Lemmatizer instance
 * @param options - Extraction options
 * @returns Set of unique lemmas
 *
 * @example
 * ```ts
 * const lemmas = extractLemmas('Við fórum í bíó', lemmatizer);
 * // Set { 'við', 'ég', 'viður', 'fara', 'í', 'bíó' }
 *
 * const filtered = extractLemmas('Við fórum í bíó', lemmatizer, { removeStopwords: true });
 * // Set { 'fara', 'bíó' }
 *
 * const verbs = extractLemmas('Hann fór og keypti bíl', lemmatizer, { wordClass: 'so' });
 * // Set { 'fara', 'kaupa' }
 * ```
 */
export function extractLemmas(
  text: string,
  lemmatizer: Lemmatizer,
  options: ExtractOptions = {}
): Set<string> {
  const { tokenize, removeStopwords: filterStopwords = false, wordClass } = options;

  const tokens = tokenize
    ? tokenize(text)
    : text.split(/\s+/).filter((t) => t.length > 0);

  const lemmas = new Set<string>();

  for (const token of tokens) {
    // Strip punctuation from token edges
    const cleaned = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (cleaned) {
      for (const lemma of lemmatizer.lemmatize(cleaned, { wordClass })) {
        if (!filterStopwords || !STOPWORDS_IS.has(lemma)) {
          lemmas.add(lemma);
        }
      }
    }
  }

  return lemmas;
}
