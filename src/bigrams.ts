/**
 * Bigram frequency lookup for disambiguation.
 *
 * Bigrams are stored as a Map for O(1) lookup.
 * Key format: "word1\tword2"
 */

export class BigramLookup {
  private bigrams: Map<string, number>;

  private constructor(bigrams: Map<string, number>) {
    this.bigrams = bigrams;
  }

  /**
   * Load bigram data from URL (gzipped JSON).
   */
  static async load(
    url: string,
    options: { fetch?: typeof fetch } = {}
  ): Promise<BigramLookup> {
    const fetchFn = options.fetch ?? fetch;
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(`Failed to load bigrams: ${response.status}`);
    }

    const stream = response.body?.pipeThrough(
      new DecompressionStream("gzip")
    );

    if (!stream) {
      throw new Error("Response body is null");
    }

    const text = await new Response(stream).text();
    return BigramLookup.loadFromString(text);
  }

  /**
   * Load from decompressed JSON string.
   */
  static loadFromString(json: string): BigramLookup {
    const data: [string, string, number][] = JSON.parse(json);
    const bigrams = new Map<string, number>();

    for (const [word1, word2, freq] of data) {
      bigrams.set(`${word1}\t${word2}`, freq);
    }

    return new BigramLookup(bigrams);
  }

  /**
   * Load from Buffer (Node.js).
   */
  static loadFromBuffer(buffer: Buffer | Uint8Array): BigramLookup {
    const decoder = new TextDecoder("utf-8");
    return BigramLookup.loadFromString(decoder.decode(buffer));
  }

  /**
   * Get bigram frequency.
   * @returns Frequency count, or 0 if not found
   */
  freq(word1: string, word2: string): number {
    return this.bigrams.get(`${word1}\t${word2}`) ?? 0;
  }

  /**
   * Check if bigram exists.
   */
  has(word1: string, word2: string): boolean {
    return this.bigrams.has(`${word1}\t${word2}`);
  }

  /**
   * Get total number of bigrams.
   */
  get size(): number {
    return this.bigrams.size;
  }
}
