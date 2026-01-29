#!/usr/bin/env python3
"""
Build binary format for lemma-is.

Creates a single .bin file with ArrayBuffer-friendly layout for efficient
browser/Cloudflare Worker usage with binary search lookups.

Binary File Layout:
┌─────────────────────────────────┐
│ Header (32 bytes)               │
│ - magic: 0x4C454D41 ("LEMA")    │
│ - version: 1                    │
│ - stringPoolSize: u32           │
│ - lemmaCount: u32               │
│ - wordCount: u32                │
│ - entryCount: u32               │
│ - bigramCount: u32              │
│ - reserved: u32                 │
├─────────────────────────────────┤
│ String Pool (~35 MB)            │
│ - All strings concatenated      │
│ - UTF-8 encoded                 │
├─────────────────────────────────┤
│ Lemma Index                     │
│ - lemmaCount × (offset:u32)     │
│ - lemmaCount × (len:u8)         │
├─────────────────────────────────┤
│ Word Offsets                    │
│ - wordCount × u32 (sorted)      │
├─────────────────────────────────┤
│ Word Lengths                    │
│ - wordCount × u8                │
├─────────────────────────────────┤
│ Entry Offsets                   │
│ - (wordCount + 1) × u32         │
├─────────────────────────────────┤
│ Lemma Entries                   │
│ - entryCount × u32              │
│ - Packed: lemmaIdx:20 + pos:4   │
├─────────────────────────────────┤
│ Bigram Word1 Offsets            │
│ - bigramCount × u32             │
├─────────────────────────────────┤
│ Bigram Word1 Lengths            │
│ - bigramCount × u8              │
├─────────────────────────────────┤
│ Bigram Word2 Offsets            │
│ - bigramCount × u32             │
├─────────────────────────────────┤
│ Bigram Word2 Lengths            │
│ - bigramCount × u8              │
├─────────────────────────────────┤
│ Bigram Frequencies              │
│ - bigramCount × u32             │
└─────────────────────────────────┘
"""

import csv
import gzip
import json
import struct
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DIST_DIR = Path(__file__).parent.parent / "data-dist"
SRC_FILE = DATA_DIR / "SHsnid.csv"
UNIGRAMS_FILE = DIST_DIR / "unigrams.json.gz"
BIGRAMS_FILE = DIST_DIR / "bigrams.json.gz"
OUTPUT_FILE = DIST_DIR / "lemma-is.bin"

MAGIC = 0x4C454D41  # "LEMA" in little-endian
VERSION = 1

# POS code mapping (same as build-data.py)
POS_MAP = {
    'no': 'no', 'kk': 'no', 'kvk': 'no', 'hk': 'no',
    'so': 'so', 'lo': 'lo', 'ao': 'ao', 'fs': 'fs',
    'fn': 'fn', 'pfn': 'fn', 'st': 'st', 'to': 'to',
    'gr': 'gr', 'uh': 'uh', 'nhm': 'so', 'rt': 'fn',
}

# Encode POS as 4-bit code (0-15)
POS_TO_CODE = {
    'no': 0, 'so': 1, 'lo': 2, 'ao': 3, 'fs': 4,
    'fn': 5, 'st': 6, 'to': 7, 'gr': 8, 'uh': 9,
    '': 10,  # unknown
}

CODE_TO_POS = {v: k for k, v in POS_TO_CODE.items()}


def load_unigram_frequencies():
    """Load unigram frequencies from icegrams extract."""
    if not UNIGRAMS_FILE.exists():
        print(f"Warning: {UNIGRAMS_FILE} not found")
        return {}
    with gzip.open(UNIGRAMS_FILE, 'rt', encoding='utf-8') as f:
        return json.load(f)


def load_bigrams():
    """Load bigram data."""
    if not BIGRAMS_FILE.exists():
        print(f"Warning: {BIGRAMS_FILE} not found")
        return []
    with gzip.open(BIGRAMS_FILE, 'rt', encoding='utf-8') as f:
        return json.load(f)


def main():
    if not SRC_FILE.exists():
        print(f"Error: {SRC_FILE} not found")
        return 1

    print("Loading unigram frequencies...")
    unigram_freqs = load_unigram_frequencies()
    print(f"  Loaded {len(unigram_freqs):,} frequencies")

    print("Loading bigrams...")
    bigrams_data = load_bigrams()
    print(f"  Loaded {len(bigrams_data):,} bigrams")

    print(f"Reading {SRC_FILE}...")
    word_to_lemma_pos = defaultdict(set)

    with open(SRC_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        for i, row in enumerate(reader):
            if len(row) >= 5:
                lemma, bin_id, word_class, domain, word_form, *rest = row
                lemma_lower = lemma.lower()
                word_lower = word_form.lower()
                pos = POS_MAP.get(word_class, word_class[:2] if len(word_class) >= 2 else word_class)
                word_to_lemma_pos[word_lower].add((lemma_lower, pos))
            if i > 0 and i % 1000000 == 0:
                print(f"  Processed {i:,} rows...")

    print(f"  Total word forms: {len(word_to_lemma_pos):,}")

    # Build unique lemma list sorted by frequency
    all_lemmas = set()
    for lemma_pos_set in word_to_lemma_pos.values():
        for lemma, _ in lemma_pos_set:
            all_lemmas.add(lemma)

    def lemma_sort_key(lemma):
        freq = unigram_freqs.get(lemma, 0)
        return (-freq, lemma)

    lemma_list = sorted(all_lemmas, key=lemma_sort_key)
    lemma_to_idx = {lemma: idx for idx, lemma in enumerate(lemma_list)}
    print(f"  Unique lemmas: {len(lemma_list):,}")

    # Sort words alphabetically for binary search
    sorted_words = sorted(word_to_lemma_pos.keys())
    word_to_sorted_idx = {word: idx for idx, word in enumerate(sorted_words)}
    print(f"  Sorted words: {len(sorted_words):,}")

    # Build string pool (all strings concatenated)
    string_pool = bytearray()
    string_offsets = {}  # string -> offset in pool

    def add_string(s):
        if s in string_offsets:
            return string_offsets[s]
        offset = len(string_pool)
        encoded = s.encode('utf-8')
        string_pool.extend(encoded)
        string_offsets[s] = offset
        return offset

    # Add all lemmas to string pool first
    print("Building string pool...")
    lemma_offsets = []
    lemma_lengths = []
    for lemma in lemma_list:
        offset = add_string(lemma)
        lemma_offsets.append(offset)
        lemma_lengths.append(len(lemma.encode('utf-8')))

    # Add all words to string pool
    word_offsets = []
    word_lengths = []
    for word in sorted_words:
        offset = add_string(word)
        word_offsets.append(offset)
        word_lengths.append(len(word.encode('utf-8')))

    # Add bigram words to string pool
    bigram_w1_offsets = []
    bigram_w1_lengths = []
    bigram_w2_offsets = []
    bigram_w2_lengths = []
    bigram_freqs = []

    # Sort bigrams by (word1, word2) for binary search
    bigrams_sorted = sorted(bigrams_data, key=lambda x: (x[0].lower(), x[1].lower()))

    for w1, w2, freq in bigrams_sorted:
        w1_lower = w1.lower()
        w2_lower = w2.lower()
        w1_offset = add_string(w1_lower)
        w2_offset = add_string(w2_lower)
        bigram_w1_offsets.append(w1_offset)
        bigram_w1_lengths.append(len(w1_lower.encode('utf-8')))
        bigram_w2_offsets.append(w2_offset)
        bigram_w2_lengths.append(len(w2_lower.encode('utf-8')))
        bigram_freqs.append(freq)

    # Pad string pool to 4-byte alignment
    while len(string_pool) % 4 != 0:
        string_pool.append(0)

    print(f"  String pool size: {len(string_pool):,} bytes (aligned)")

    # Build entry data (lemma index + POS packed)
    print("Building entry data...")
    all_entries = []
    entry_offsets = [0]  # Start offset for each word's entries

    for word in sorted_words:
        lemma_pos_set = word_to_lemma_pos[word]

        # Sort by frequency
        def sort_key(lp):
            lemma, pos = lp
            freq = unigram_freqs.get(lemma, 0)
            return (-freq, lemma, pos)

        sorted_pairs = sorted(lemma_pos_set, key=sort_key)

        for lemma, pos in sorted_pairs:
            lemma_idx = lemma_to_idx[lemma]
            pos_code = POS_TO_CODE.get(pos, 10)  # 10 = unknown
            # Pack: lemma_idx (20 bits) + pos_code (4 bits) = 24 bits, fits in u32
            packed = (lemma_idx << 4) | pos_code
            all_entries.append(packed)

        entry_offsets.append(len(all_entries))

    print(f"  Total entries: {len(all_entries):,}")

    # Write binary file
    print(f"Writing {OUTPUT_FILE}...")
    DIST_DIR.mkdir(exist_ok=True)

    with open(OUTPUT_FILE, 'wb') as f:
        # Header (32 bytes)
        header = struct.pack('<IIIIIIII',
            MAGIC,
            VERSION,
            len(string_pool),
            len(lemma_list),
            len(sorted_words),
            len(all_entries),
            len(bigrams_sorted),
            0  # reserved
        )
        f.write(header)

        # String pool
        f.write(string_pool)

        # Lemma offsets (u32 each)
        for offset in lemma_offsets:
            f.write(struct.pack('<I', offset))

        # Lemma lengths (u8 each)
        lemma_lengths_bytes = bytes(lemma_lengths)
        f.write(lemma_lengths_bytes)
        # Pad to 4-byte alignment
        padding = (4 - len(lemma_lengths_bytes) % 4) % 4
        f.write(b'\x00' * padding)

        # Word offsets (u32 each)
        for offset in word_offsets:
            f.write(struct.pack('<I', offset))

        # Word lengths (u8 each)
        word_lengths_bytes = bytes(word_lengths)
        f.write(word_lengths_bytes)
        # Pad to 4-byte alignment
        padding = (4 - len(word_lengths_bytes) % 4) % 4
        f.write(b'\x00' * padding)

        # Entry offsets (u32 each, wordCount + 1)
        for offset in entry_offsets:
            f.write(struct.pack('<I', offset))

        # Entries (u32 each)
        for entry in all_entries:
            f.write(struct.pack('<I', entry))

        # Bigram word1 offsets
        for offset in bigram_w1_offsets:
            f.write(struct.pack('<I', offset))

        # Bigram word1 lengths
        bigram_w1_lengths_bytes = bytes(bigram_w1_lengths)
        f.write(bigram_w1_lengths_bytes)
        # Pad to 4-byte alignment
        padding = (4 - len(bigram_w1_lengths_bytes) % 4) % 4
        f.write(b'\x00' * padding)

        # Bigram word2 offsets
        for offset in bigram_w2_offsets:
            f.write(struct.pack('<I', offset))

        # Bigram word2 lengths
        bigram_w2_lengths_bytes = bytes(bigram_w2_lengths)
        f.write(bigram_w2_lengths_bytes)
        # Pad to 4-byte alignment
        padding = (4 - len(bigram_w2_lengths_bytes) % 4) % 4
        f.write(b'\x00' * padding)

        # Bigram frequencies
        for freq in bigram_freqs:
            f.write(struct.pack('<I', freq))

    file_size = OUTPUT_FILE.stat().st_size
    print(f"\nOutput: {OUTPUT_FILE}")
    print(f"  File size: {file_size / 1024 / 1024:.2f} MB")

    # Size breakdown
    print(f"\nSize breakdown:")
    print(f"  Header: 32 bytes")
    print(f"  String pool: {len(string_pool):,} bytes ({len(string_pool) / 1024 / 1024:.2f} MB)")
    print(f"  Lemma offsets: {len(lemma_list) * 4:,} bytes")
    print(f"  Lemma lengths: {len(lemma_list):,} bytes")
    print(f"  Word offsets: {len(sorted_words) * 4:,} bytes")
    print(f"  Word lengths: {len(sorted_words):,} bytes")
    print(f"  Entry offsets: {(len(sorted_words) + 1) * 4:,} bytes")
    print(f"  Entries: {len(all_entries) * 4:,} bytes")
    print(f"  Bigram w1 offsets: {len(bigrams_sorted) * 4:,} bytes")
    print(f"  Bigram w1 lengths: {len(bigrams_sorted):,} bytes")
    print(f"  Bigram w2 offsets: {len(bigrams_sorted) * 4:,} bytes")
    print(f"  Bigram w2 lengths: {len(bigrams_sorted):,} bytes")
    print(f"  Bigram freqs: {len(bigrams_sorted) * 4:,} bytes")

    # Verify some lookups
    print("\nVerification samples:")
    test_words = ['við', 'á', 'hestinum', 'fara', 'góðan']
    for word in test_words:
        if word in word_to_sorted_idx:
            idx = word_to_sorted_idx[word]
            start = entry_offsets[idx]
            end = entry_offsets[idx + 1]
            entries = all_entries[start:end]
            lemmas = []
            for e in entries[:3]:
                lemma_idx = e >> 4
                pos_code = e & 0xF
                lemma = lemma_list[lemma_idx]
                pos = CODE_TO_POS.get(pos_code, '??')
                lemmas.append(f"{lemma}:{pos}")
            print(f"  {word} → {', '.join(lemmas)}")

    return 0


if __name__ == "__main__":
    exit(main())
