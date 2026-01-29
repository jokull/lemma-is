#!/usr/bin/env python3
"""
Extract high-frequency bigrams from icegrams for disambiguation.

Uses unigram_succ() to efficiently iterate bigram successors for each word.
Creates a compact JSON format for browser use.

Output format: JSON array of [word1, word2, freq] tuples
Target size: 2-3MB gzipped
"""

import gzip
import json
from pathlib import Path

from icegrams import Ngrams

DATA_DIR = Path(__file__).parent.parent / "data"
DIST_DIR = Path(__file__).parent.parent / "data-dist"

# Minimum frequency threshold
MIN_FREQ = 50

# How many successors to check per word (more = better coverage, slower)
MAX_SUCCESSORS = 500


def main():
    print("Loading icegrams...")
    n = Ngrams()
    storage = n.ngrams

    # Find vocab size by trying to access words until we get an error
    print("Finding vocabulary size...")
    vocab_size = 0
    for i in range(1000000):
        try:
            storage.id_to_word(i)
            vocab_size = i + 1
        except (IndexError, KeyError):
            break
    print(f"  Vocabulary size: {vocab_size:,}")

    # Skip tokens
    skip_prefixes = ['[', '<']

    def is_valid_word(word):
        if not word:
            return False
        if any(word.startswith(p) for p in skip_prefixes):
            return False
        if len(word) == 1 and not word.isalpha():
            return False
        return True

    # Collect bigrams using unigram_succ
    print(f"Extracting bigrams (freq >= {MIN_FREQ})...")
    bigrams = []
    seen = set()  # Avoid duplicates

    for i in range(vocab_size):
        if i % 50000 == 0:
            print(f"  Processing word {i:,}/{vocab_size:,} ({len(bigrams):,} bigrams)...")

        try:
            word1 = storage.id_to_word(i)
        except (IndexError, KeyError):
            continue

        if not is_valid_word(word1):
            continue

        # Get top successors for this word (n, word_id)
        try:
            successors = storage.unigram_succ(MAX_SUCCESSORS, i)
        except Exception:
            continue

        for word2, logprob in successors:
            if not is_valid_word(word2):
                continue

            # Skip if already seen
            key = (word1, word2)
            if key in seen:
                continue

            # Get actual frequency
            try:
                freq = n.freq(word1, word2)
            except Exception:
                continue

            if freq >= MIN_FREQ:
                bigrams.append((word1, word2, freq))
                seen.add(key)

    print(f"  Total bigrams found: {len(bigrams):,}")

    # Sort by frequency descending
    bigrams.sort(key=lambda x: -x[2])

    # Save as JSON
    DIST_DIR.mkdir(exist_ok=True)
    output_file = DIST_DIR / "bigrams.json.gz"

    print(f"Writing {output_file}...")
    with gzip.open(output_file, 'wt', encoding='utf-8') as f:
        json.dump(bigrams, f, ensure_ascii=False, separators=(',', ':'))

    # Report stats
    size = output_file.stat().st_size
    print(f"\nStats:")
    print(f"  Total bigrams: {len(bigrams):,}")
    if bigrams:
        print(f"  Min frequency: {bigrams[-1][2]:,}")
        print(f"  Max frequency: {bigrams[0][2]:,}")
    print(f"  File size: {size / 1024 / 1024:.2f} MB")

    # Sample output
    print("\nTop 20 bigrams:")
    for w1, w2, freq in bigrams[:20]:
        print(f"  {w1} {w2}: {freq:,}")

    return 0


if __name__ == "__main__":
    exit(main())
