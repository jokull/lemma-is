#!/usr/bin/env python3
"""
Extract unigram frequencies from icegrams for disambiguation fallback.

Creates data-dist/unigrams.json.gz mapping words to their corpus frequencies.
This is used when no bigram context is available.
"""

import gzip
import json
from pathlib import Path

from icegrams import Ngrams

DIST_DIR = Path(__file__).parent.parent / "data-dist"

# Minimum frequency to include (filters noise)
MIN_FREQ = 5


def main():
    print("Loading icegrams...")
    n = Ngrams()
    storage = n.ngrams

    # Find vocabulary size
    print("Finding vocabulary size...")
    vocab_size = 0
    for i in range(1000000):
        try:
            storage.id_to_word(i)
            vocab_size = i + 1
        except (IndexError, KeyError):
            break
    print(f"  Vocabulary size: {vocab_size:,}")

    # Skip special tokens
    skip_prefixes = ['[', '<']

    def is_valid_word(word):
        if not word:
            return False
        if any(word.startswith(p) for p in skip_prefixes):
            return False
        return True

    # Extract unigram frequencies
    print(f"Extracting unigram frequencies (freq >= {MIN_FREQ})...")
    unigrams = {}
    skipped = 0

    for i in range(vocab_size):
        if i % 50000 == 0:
            print(f"  Processing word {i:,}/{vocab_size:,} ({len(unigrams):,} unigrams)...")

        try:
            word = storage.id_to_word(i)
        except (IndexError, KeyError):
            continue

        if not is_valid_word(word):
            skipped += 1
            continue

        # Get frequency using the storage's unigram_frequency method
        try:
            freq = storage.unigram_frequency(i)
        except Exception:
            continue

        if freq >= MIN_FREQ:
            # Lowercase for consistency with lemmatizer
            word_lower = word.lower()
            # Keep the max frequency if word appears multiple times with different casing
            if word_lower not in unigrams or freq > unigrams[word_lower]:
                unigrams[word_lower] = freq

    print(f"  Total unigrams found: {len(unigrams):,}")
    print(f"  Skipped special tokens: {skipped:,}")

    # Sort by frequency descending for inspection
    sorted_unigrams = sorted(unigrams.items(), key=lambda x: -x[1])

    # Save as compact JSON (array of [word, freq] for smaller size)
    DIST_DIR.mkdir(exist_ok=True)
    output_file = DIST_DIR / "unigrams.json.gz"

    print(f"Writing {output_file}...")
    with gzip.open(output_file, 'wt', encoding='utf-8') as f:
        # Use dict format for O(1) lookup in JS
        json.dump(dict(sorted_unigrams), f, ensure_ascii=False, separators=(',', ':'))

    # Report stats
    size = output_file.stat().st_size
    print(f"\nStats:")
    print(f"  Total unigrams: {len(unigrams):,}")
    if sorted_unigrams:
        print(f"  Min frequency: {sorted_unigrams[-1][1]:,}")
        print(f"  Max frequency: {sorted_unigrams[0][1]:,}")
    print(f"  File size: {size / 1024 / 1024:.2f} MB")

    # Sample output
    print("\nTop 30 unigrams:")
    for word, freq in sorted_unigrams[:30]:
        print(f"  {word}: {freq:,}")

    # Show some common ambiguous words
    print("\nFrequencies for common ambiguous words:")
    test_words = ['á', 'við', 'og', 'er', 'að', 'sem', 'hann', 'ég', 'til', 'var']
    for word in test_words:
        freq = unigrams.get(word, 0)
        print(f"  {word}: {freq:,}")

    return 0


if __name__ == "__main__":
    exit(main())
