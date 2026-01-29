/**
 * Unigram frequency lookup for fallback disambiguation.
 *
 * When no bigram context is available, we can still rank lemmas
 * by their corpus frequency - more common words are more likely.
 */

export class UnigramLookup {
  private freqs: Map<string, number>;

  private constructor(freqs: Map<string, number>) {
    this.freqs = freqs;
  }

  /**
   * Load unigram data from URL (gzipped JSON).
   */
  static async load(
    url: string,
    options: { fetch?: typeof fetch } = {}
  ): Promise<UnigramLookup> {
    const fetchFn = options.fetch ?? fetch;
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(`Failed to load unigrams: ${response.status}`);
    }

    const stream = response.body?.pipeThrough(
      new DecompressionStream("gzip")
    );

    if (!stream) {
      throw new Error("Response body is null");
    }

    const text = await new Response(stream).text();
    return UnigramLookup.loadFromString(text);
  }

  /**
   * Load from decompressed JSON string.
   */
  static loadFromString(json: string): UnigramLookup {
    const data: Record<string, number> = JSON.parse(json);
    const freqs = new Map<string, number>();

    for (const [word, freq] of Object.entries(data)) {
      freqs.set(word, freq);
    }

    return new UnigramLookup(freqs);
  }

  /**
   * Load from Buffer (Node.js).
   */
  static loadFromBuffer(buffer: Buffer | Uint8Array): UnigramLookup {
    const decoder = new TextDecoder("utf-8");
    return UnigramLookup.loadFromString(decoder.decode(buffer));
  }

  /**
   * Get frequency for a word.
   * @returns Frequency count, or 0 if not found
   */
  freq(word: string): number {
    return this.freqs.get(word.toLowerCase()) ?? 0;
  }

  /**
   * Check if word exists in corpus.
   */
  has(word: string): boolean {
    return this.freqs.has(word.toLowerCase());
  }

  /**
   * Get total number of words.
   */
  get size(): number {
    return this.freqs.size;
  }

  /**
   * Sort lemmas by frequency (descending).
   * Most common lemma first.
   */
  sortByFrequency(lemmas: string[]): string[] {
    return [...lemmas].sort((a, b) => {
      const freqA = this.freq(a);
      const freqB = this.freq(b);
      if (freqA !== freqB) {
        return freqB - freqA; // Descending
      }
      return a.localeCompare(b); // Alphabetical tiebreaker
    });
  }

  /**
   * Pick the most frequent lemma from candidates.
   */
  pickMostFrequent(lemmas: string[]): string | null {
    if (lemmas.length === 0) return null;
    if (lemmas.length === 1) return lemmas[0];

    let best = lemmas[0];
    let bestFreq = this.freq(best);

    for (let i = 1; i < lemmas.length; i++) {
      const freq = this.freq(lemmas[i]);
      if (freq > bestFreq) {
        best = lemmas[i];
        bestFreq = freq;
      }
    }

    return best;
  }
}
