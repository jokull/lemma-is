/**
 * Minimal Bloom filter for compact set membership checks.
 */

export interface BloomFilterOptions {
  falsePositiveRate?: number;
  maxHashFunctions?: number;
}

export class BloomFilter {
  private bits: Uint8Array;
  private sizeBits: number;
  private hashCount: number;

  private constructor(bits: Uint8Array, sizeBits: number, hashCount: number) {
    this.bits = bits;
    this.sizeBits = sizeBits;
    this.hashCount = hashCount;
  }

  static fromValues(values: string[], options: BloomFilterOptions = {}): BloomFilter {
    const n = Math.max(values.length, 1);
    const p = options.falsePositiveRate ?? 0.01;

    const m = Math.max(1, Math.ceil((-n * Math.log(p)) / (Math.LN2 * Math.LN2)));
    const k = Math.max(1, Math.round((m / n) * Math.LN2));
    const hashCount = options.maxHashFunctions
      ? Math.min(k, options.maxHashFunctions)
      : k;

    const bytes = Math.ceil(m / 8);
    const bits = new Uint8Array(bytes);
    const filter = new BloomFilter(bits, m, hashCount);

    for (const value of values) {
      filter.add(value);
    }

    return filter;
  }

  add(value: string): void {
    const [h1, h2] = this.hashes(value);
    for (let i = 0; i < this.hashCount; i++) {
      const combined = (h1 + i * h2) % this.sizeBits;
      this.setBit(combined);
    }
  }

  has(value: string): boolean {
    const [h1, h2] = this.hashes(value);
    for (let i = 0; i < this.hashCount; i++) {
      const combined = (h1 + i * h2) % this.sizeBits;
      if (!this.getBit(combined)) return false;
    }
    return true;
  }

  private setBit(index: number): void {
    const byteIndex = index >>> 3;
    const bit = index & 7;
    this.bits[byteIndex] |= 1 << bit;
  }

  private getBit(index: number): boolean {
    const byteIndex = index >>> 3;
    const bit = index & 7;
    return (this.bits[byteIndex] & (1 << bit)) !== 0;
  }

  private hashes(value: string): [number, number] {
    const str = value.toLowerCase();
    let hash1 = 2166136261 >>> 0;
    let hash2 = 2166136261 >>> 0;

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      hash1 ^= code;
      hash1 = Math.imul(hash1, 16777619) >>> 0;

      hash2 ^= code;
      hash2 = Math.imul(hash2, 2166136261) >>> 0;
    }

    hash2 ^= hash2 >>> 13;
    hash2 = Math.imul(hash2, 0x85ebca6b) >>> 0;
    hash2 ^= hash2 >>> 16;

    return [hash1 >>> 0, hash2 >>> 0 || 0x27d4eb2d];
  }
}
