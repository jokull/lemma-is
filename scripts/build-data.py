#!/usr/bin/env python3
"""
Build optimized lemma lookup data from BÍN CSV.

Creates two files:
- lemmas.txt.gz: Newline-separated list of unique lemmas
- lookup.tsv.gz: TSV lookup table (word -> lemma_idx:POS pairs)

Format allows efficient loading in browser:
- Load lemmas.txt.gz, split by newline to get lemma array
- Load lookup.tsv.gz, parse as TSV (word\tidx1:pos1,idx2:pos2,...)

POS codes from BÍN:
- no = nafnorð (noun)
- so = sagnorð (verb)
- lo = lýsingarorð (adjective)
- ao = atviksorð (adverb)
- fs = forsetning (preposition)
- fn = fornafn (pronoun)
- st = samtenging (conjunction)
- to = töluorð (numeral)
- gr = greinir (article)
- hk/kk/kvk = kyn (gender markers, mapped to 'no')
"""

import csv
import gzip
import json
import os
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DIST_DIR = Path(__file__).parent.parent / "data-dist"
SRC_FILE = DATA_DIR / "SHsnid.csv"
UNIGRAMS_FILE = DIST_DIR / "unigrams.json.gz"

# Map BÍN word classes to simplified POS codes
POS_MAP = {
    'no': 'no',   # nafnorð (noun)
    'kk': 'no',   # karlkyn (masculine noun)
    'kvk': 'no',  # kvenkyn (feminine noun)
    'hk': 'no',   # hvorugkyn (neuter noun)
    'so': 'so',   # sagnorð (verb)
    'lo': 'lo',   # lýsingarorð (adjective)
    'ao': 'ao',   # atviksorð (adverb)
    'fs': 'fs',   # forsetning (preposition)
    'fn': 'fn',   # fornafn (pronoun)
    'pfn': 'fn',  # persónufornafn (personal pronoun)
    'st': 'st',   # samtenging (conjunction)
    'to': 'to',   # töluorð (numeral)
    'gr': 'gr',   # greinir (article)
    'uh': 'uh',   # upphrópun (interjection)
    'nhm': 'so',  # nafnháttur with -st (verbal noun)
    'rt': 'fn',   # raðtala (ordinal, treat as pronoun-like)
}


def load_unigram_frequencies():
    """Load unigram frequencies from icegrams extract."""
    if not UNIGRAMS_FILE.exists():
        print(f"Warning: {UNIGRAMS_FILE} not found, lemmas will be in arbitrary order")
        return {}

    print(f"Loading unigram frequencies from {UNIGRAMS_FILE}...")
    with gzip.open(UNIGRAMS_FILE, 'rt', encoding='utf-8') as f:
        freqs = json.load(f)
    print(f"  Loaded {len(freqs):,} frequency entries")
    return freqs


def main():
    if not SRC_FILE.exists():
        print(f"Error: {SRC_FILE} not found")
        print("Download from https://bin.arnastofnun.is/DMII/LTdata/data/")
        return 1

    # Load unigram frequencies for sorting
    unigram_freqs = load_unigram_frequencies()

    print(f"Reading {SRC_FILE}...")

    # Build word -> (lemma, pos) mapping
    # Each word form maps to a set of (lemma, pos) pairs
    word_to_lemma_pos = defaultdict(set)

    with open(SRC_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        for i, row in enumerate(reader):
            if len(row) >= 5:
                lemma, bin_id, word_class, domain, word_form, *rest = row
                # Normalize
                lemma_lower = lemma.lower()
                word_lower = word_form.lower()
                # Map word class to simplified POS
                pos = POS_MAP.get(word_class, word_class[:2] if len(word_class) >= 2 else word_class)
                word_to_lemma_pos[word_lower].add((lemma_lower, pos))
            if i > 0 and i % 1000000 == 0:
                print(f"  Processed {i:,} rows...")

    print(f"  Total word forms: {len(word_to_lemma_pos):,}")

    # Build unique lemma list
    all_lemmas = set()
    for lemma_pos_set in word_to_lemma_pos.values():
        for lemma, _ in lemma_pos_set:
            all_lemmas.add(lemma)

    # Sort lemmas by frequency (descending), then alphabetically for ties
    def lemma_sort_key(lemma):
        freq = unigram_freqs.get(lemma, 0)
        return (-freq, lemma)

    lemma_list = sorted(all_lemmas, key=lemma_sort_key)
    lemma_to_idx = {lemma: idx for idx, lemma in enumerate(lemma_list)}

    print(f"  Unique lemmas: {len(lemma_list):,}")

    # Create output directory
    DIST_DIR.mkdir(exist_ok=True)

    # Write lemmas as newline-separated text
    lemmas_file = DIST_DIR / "lemmas.txt.gz"
    print(f"Writing {lemmas_file}...")
    with gzip.open(lemmas_file, 'wt', encoding='utf-8') as f:
        f.write('\n'.join(lemma_list))

    # Write lookup as TSV: word\tidx1:pos1,idx2:pos2,...
    # Sort lemma indices by frequency for each word
    lookup_file = DIST_DIR / "lookup.tsv.gz"
    print(f"Writing {lookup_file}...")

    entries_written = 0
    with gzip.open(lookup_file, 'wt', encoding='utf-8') as f:
        for word in sorted(word_to_lemma_pos.keys()):
            lemma_pos_set = word_to_lemma_pos[word]

            # Skip if word is its own only lemma with no meaningful POS info
            if len(lemma_pos_set) == 1:
                only_lemma, only_pos = next(iter(lemma_pos_set))
                if only_lemma == word:
                    continue

            # Sort by frequency (descending) - most common interpretation first
            def sort_key(lp):
                lemma, pos = lp
                freq = unigram_freqs.get(lemma, 0)
                return (-freq, lemma, pos)

            sorted_pairs = sorted(lemma_pos_set, key=sort_key)

            # Format: idx:pos pairs
            parts = []
            for lemma, pos in sorted_pairs:
                idx = lemma_to_idx[lemma]
                parts.append(f"{idx}:{pos}")

            f.write(f"{word}\t{','.join(parts)}\n")
            entries_written += 1

    print(f"  Lookup entries: {entries_written:,}")

    # Report sizes
    lemmas_size = lemmas_file.stat().st_size
    lookup_size = lookup_file.stat().st_size
    total_size = lemmas_size + lookup_size

    print(f"\nOutput sizes:")
    print(f"  lemmas.txt.gz: {lemmas_size / 1024 / 1024:.1f} MB")
    print(f"  lookup.tsv.gz: {lookup_size / 1024 / 1024:.1f} MB")
    print(f"  Total: {total_size / 1024 / 1024:.1f} MB")

    # Show sample entries for verification
    print("\nSample lookup entries:")
    test_words = ['við', 'á', 'hestinum', 'fara', 'góðan']
    for word in test_words:
        if word in word_to_lemma_pos:
            lemma_pos_set = word_to_lemma_pos[word]
            sorted_pairs = sorted(lemma_pos_set, key=lambda lp: (-unigram_freqs.get(lp[0], 0), lp[0], lp[1]))
            formatted = ', '.join(f"{l}:{p}" for l, p in sorted_pairs[:5])
            print(f"  {word} → {formatted}")

    return 0


if __name__ == "__main__":
    exit(main())
