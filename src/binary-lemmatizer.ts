/**
 * Binary format lemmatizer for efficient memory usage.
 *
 * Uses ArrayBuffer with TypedArray views and binary search for O(log n) lookups.
 * Target memory: ~70MB vs ~1.2GB for JS Map-based approach.
 *
 * Binary file format:
 * - Header (32 bytes): magic, version, counts
 * - String pool: all strings concatenated UTF-8
 * - Lemma index: offsets + lengths
 * - Word index: offsets + lengths (sorted alphabetically)
 * - Entry offsets: start/end of entries for each word
 * - Entries: packed lemmaIdx:20 + posCode:4
 * - Bigrams: word1/word2 offsets + lengths + frequencies (sorted)
 */

import type { WordClass, LemmaWithPOS, LemmatizerLike } from "./types.js";

const MAGIC = 0x4c454d41; // "LEMA"

// POS code to string mapping (must match build-binary.py)
const CODE_TO_POS: WordClass[] = [
  "no",
  "so",
  "lo",
  "ao",
  "fs",
  "fn",
  "st",
  "to",
  "gr",
  "uh",
];

export interface BinaryLemmatizerOptions {
  fetch?: typeof fetch;
}

export interface BinaryLemmatizeOptions {
  wordClass?: WordClass;
}

export class BinaryLemmatizer implements LemmatizerLike {
  private buffer: ArrayBuffer;
  private stringPool: Uint8Array;
  private lemmaOffsets: Uint32Array;
  private lemmaLengths: Uint8Array;
  private wordOffsets: Uint32Array;
  private wordLengths: Uint8Array;
  private entryOffsets: Uint32Array;
  private entries: Uint32Array;
  private bigramW1Offsets: Uint32Array;
  private bigramW1Lengths: Uint8Array;
  private bigramW2Offsets: Uint32Array;
  private bigramW2Lengths: Uint8Array;
  private bigramFreqs: Uint32Array;

  private lemmaCount: number;
  private wordCount: number;
  private entryCount: number;
  private bigramCount: number;

  private decoder = new TextDecoder("utf-8");

  private constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    const view = new DataView(buffer);

    // Read header
    const magic = view.getUint32(0, true);
    if (magic !== MAGIC) {
      throw new Error(
        `Invalid binary format: expected magic 0x${MAGIC.toString(16)}, got 0x${magic.toString(16)}`
      );
    }

    const version = view.getUint32(4, true);
    if (version !== 1) {
      throw new Error(`Unsupported version: ${version}`);
    }

    const stringPoolSize = view.getUint32(8, true);
    this.lemmaCount = view.getUint32(12, true);
    this.wordCount = view.getUint32(16, true);
    this.entryCount = view.getUint32(20, true);
    this.bigramCount = view.getUint32(24, true);
    // reserved at 28

    // Calculate section offsets
    let offset = 32;

    // String pool
    this.stringPool = new Uint8Array(buffer, offset, stringPoolSize);
    offset += stringPoolSize;

    // Lemma offsets (u32 × lemmaCount)
    this.lemmaOffsets = new Uint32Array(buffer, offset, this.lemmaCount);
    offset += this.lemmaCount * 4;

    // Lemma lengths (u8 × lemmaCount)
    this.lemmaLengths = new Uint8Array(buffer, offset, this.lemmaCount);
    offset += this.lemmaCount;
    // Align to 4 bytes
    offset = (offset + 3) & ~3;

    // Word offsets (u32 × wordCount)
    this.wordOffsets = new Uint32Array(buffer, offset, this.wordCount);
    offset += this.wordCount * 4;

    // Word lengths (u8 × wordCount)
    this.wordLengths = new Uint8Array(buffer, offset, this.wordCount);
    offset += this.wordCount;
    // Align to 4 bytes
    offset = (offset + 3) & ~3;

    // Entry offsets (u32 × (wordCount + 1))
    this.entryOffsets = new Uint32Array(buffer, offset, this.wordCount + 1);
    offset += (this.wordCount + 1) * 4;

    // Entries (u32 × entryCount)
    this.entries = new Uint32Array(buffer, offset, this.entryCount);
    offset += this.entryCount * 4;

    // Bigram word1 offsets
    this.bigramW1Offsets = new Uint32Array(buffer, offset, this.bigramCount);
    offset += this.bigramCount * 4;

    // Bigram word1 lengths
    this.bigramW1Lengths = new Uint8Array(buffer, offset, this.bigramCount);
    offset += this.bigramCount;
    // Align to 4 bytes
    offset = (offset + 3) & ~3;

    // Bigram word2 offsets
    this.bigramW2Offsets = new Uint32Array(buffer, offset, this.bigramCount);
    offset += this.bigramCount * 4;

    // Bigram word2 lengths
    this.bigramW2Lengths = new Uint8Array(buffer, offset, this.bigramCount);
    offset += this.bigramCount;
    // Align to 4 bytes
    offset = (offset + 3) & ~3;

    // Bigram frequencies
    this.bigramFreqs = new Uint32Array(buffer, offset, this.bigramCount);
  }

  /**
   * Load binary lemmatizer from URL.
   */
  static async load(
    url: string,
    options: BinaryLemmatizerOptions = {}
  ): Promise<BinaryLemmatizer> {
    const fetchFn = options.fetch ?? fetch;
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(`Failed to load binary data: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new BinaryLemmatizer(buffer);
  }

  /**
   * Load from ArrayBuffer (for Node.js or pre-loaded data).
   */
  static loadFromBuffer(buffer: ArrayBuffer): BinaryLemmatizer {
    return new BinaryLemmatizer(buffer);
  }

  /**
   * Get string from string pool.
   */
  private getString(offset: number, length: number): string {
    return this.decoder.decode(this.stringPool.subarray(offset, offset + length));
  }

  /**
   * Get lemma by index.
   */
  private getLemma(index: number): string {
    return this.getString(this.lemmaOffsets[index], this.lemmaLengths[index]);
  }

  /**
   * Get word by index.
   */
  private getWord(index: number): string {
    return this.getString(this.wordOffsets[index], this.wordLengths[index]);
  }

  /**
   * Binary search for word in sorted word array.
   * Returns index or -1 if not found.
   */
  private findWord(word: string): number {
    let left = 0;
    let right = this.wordCount - 1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const midWord = this.getWord(mid);

      if (midWord === word) {
        return mid;
      }
      if (midWord < word) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1;
  }

  /**
   * Look up possible lemmas for a word form.
   * Results are sorted by corpus frequency (most common first).
   */
  lemmatize(word: string, options: BinaryLemmatizeOptions = {}): string[] {
    const normalized = word.toLowerCase();
    const idx = this.findWord(normalized);

    if (idx === -1) {
      return [normalized];
    }

    const start = this.entryOffsets[idx];
    const end = this.entryOffsets[idx + 1];

    const { wordClass } = options;
    const result: string[] = [];

    for (let i = start; i < end; i++) {
      const entry = this.entries[i];
      const lemmaIdx = entry >>> 4;
      const posCode = entry & 0xf;
      const pos = CODE_TO_POS[posCode];

      if (wordClass && pos !== wordClass) {
        continue;
      }

      result.push(this.getLemma(lemmaIdx));
    }

    if (result.length === 0) {
      return [normalized];
    }

    return result;
  }

  /**
   * Look up lemmas with their word class (POS) tags.
   */
  lemmatizeWithPOS(word: string): LemmaWithPOS[] {
    const normalized = word.toLowerCase();
    const idx = this.findWord(normalized);

    if (idx === -1) {
      return [];
    }

    const start = this.entryOffsets[idx];
    const end = this.entryOffsets[idx + 1];
    const result: LemmaWithPOS[] = [];

    for (let i = start; i < end; i++) {
      const entry = this.entries[i];
      const lemmaIdx = entry >>> 4;
      const posCode = entry & 0xf;

      result.push({
        lemma: this.getLemma(lemmaIdx),
        pos: CODE_TO_POS[posCode] ?? ("" as WordClass),
      });
    }

    return result;
  }

  /**
   * Binary search for bigram. Returns index or -1.
   */
  private findBigram(word1: string, word2: string): number {
    let left = 0;
    let right = this.bigramCount - 1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const midW1 = this.getString(
        this.bigramW1Offsets[mid],
        this.bigramW1Lengths[mid]
      );

      if (midW1 < word1) {
        left = mid + 1;
      } else if (midW1 > word1) {
        right = mid - 1;
      } else {
        // word1 matches, compare word2
        const midW2 = this.getString(
          this.bigramW2Offsets[mid],
          this.bigramW2Lengths[mid]
        );

        if (midW2 === word2) {
          return mid;
        }
        if (midW2 < word2) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }

    return -1;
  }

  /**
   * Get bigram frequency.
   * @returns Frequency count, or 0 if not found
   */
  bigramFreq(word1: string, word2: string): number {
    const idx = this.findBigram(word1.toLowerCase(), word2.toLowerCase());
    return idx === -1 ? 0 : this.bigramFreqs[idx];
  }

  /**
   * Check if a word is known to the lemmatizer.
   */
  isKnown(word: string): boolean {
    return this.findWord(word.toLowerCase()) !== -1;
  }

  /**
   * Get the total number of lemmas in the database.
   */
  get lemmaCountValue(): number {
    return this.lemmaCount;
  }

  /**
   * Get the total number of word forms.
   */
  get wordFormCount(): number {
    return this.wordCount;
  }

  /**
   * Get the total number of bigrams.
   */
  get bigramCountValue(): number {
    return this.bigramCount;
  }

  /**
   * Get raw buffer size (approximate memory usage).
   */
  get bufferSize(): number {
    return this.buffer.byteLength;
  }
}
