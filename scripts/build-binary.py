#!/usr/bin/env python3
"""
Build binary format for lemma-is.

Creates a single .bin file with ArrayBuffer-friendly layout for efficient
browser/Cloudflare Worker usage with binary search lookups.

Binary File Layout:
┌─────────────────────────────────┐
│ Header (32 bytes)               │
│ - magic: 0x4C454D41 ("LEMA")    │
│ - version: 2                    │
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
│ - Packed: lemmaIdx:20 | pos:4 | │
│           case:2 | gender:2 |   │
│           number:1 = 29 bits    │
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

Entry packing (29 bits in u32):
  - bits 0-3: pos (4 bits, 0-15)
  - bits 4-5: case (2 bits: 0=none, 1=nf, 2=þf, 3=þgf) + ef in bit 6
  - bits 6-7: case continued (ef=bit6) + gender start
  - bits 8-9: gender (2 bits: 0=none, 1=kk, 2=kvk, 3=hk)
  - bit 10: number (1 bit: 0=et/none, 1=ft)
  - bits 11-30: lemmaIdx (20 bits, up to 1M lemmas)

Simplified packing:
  packed = lemmaIdx << 9 | number << 8 | gender << 6 | case << 4 | pos
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
VERSION = 2  # Version 2 adds case/gender/number

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

# Case codes (2 bits + 1 for ef = 4 values encoded in 2 bits)
# The mark field contains: NF (nominative), ÞF (accusative), ÞGF (dative), EF (genitive)
CASE_TO_CODE = {
    '': 0,    # unknown/none
    'nf': 1,  # nominative
    'þf': 2,  # accusative
    'þgf': 3, # dative (uses 2 bits)
    'ef': 3,  # genitive - we'll use a separate approach
}

# Actually use 4 values in 2 bits properly
CASE_TO_CODE = {
    '': 0,    # unknown/none
    'nf': 1,  # nominative
    'þf': 2,  # accusative
    'þgf': 3, # dative
}
# ef (genitive) needs special handling - we have 4 values but only 2 bits
# Solution: use 2 bits for case (0-3), where 0=none, 1=nf, 2=þf, 3=þgf/ef combined
# Then distinguish þgf vs ef using context or another bit

# Simpler approach: use 3 bits for case (0-7) to fit all 5 values
# But we want to stay compact. Let's use:
# 0 = none, 1 = nf, 2 = þf, 3 = þgf, 4 = ef (requires 3 bits)
CASE_TO_CODE = {
    '': 0,
    'nf': 1,
    'þf': 2,
    'þgf': 3,
    'ef': 4,
}
CODE_TO_CASE = {v: k for k, v in CASE_TO_CODE.items()}

# Gender codes (2 bits = 4 values)
GENDER_TO_CODE = {
    '': 0,    # unknown/none
    'kk': 1,  # masculine
    'kvk': 2, # feminine
    'hk': 3,  # neuter
}
CODE_TO_GENDER = {v: k for k, v in GENDER_TO_CODE.items()}

# Number codes (1 bit = 2 values)
NUMBER_TO_CODE = {
    '': 0,    # unknown/none or singular
    'et': 0,  # singular (eintal)
    'ft': 1,  # plural (fleirtala)
}
CODE_TO_NUMBER = {0: 'et', 1: 'ft'}


def parse_mark(mark: str, word_class: str = '') -> tuple[str, str, str]:
    """
    Parse BÍN mark field to extract case, gender, number.

    Mark field contains concatenated codes like:
    - "NFET" (nominative, singular)
    - "ÞGFETgr" (dative, singular, with article)
    - "GM-VH-NT-1P-ET" (verb form with tense, mood, person, number)

    Gender comes from word_class column (kk, kvk, hk).

    Returns (case, gender, number) as lowercase codes or empty string.
    """
    if not mark:
        return ('', '', '')

    mark_upper = mark.upper()

    case = ''
    number = ''

    # Case detection (order matters - check longer patterns first)
    if 'ÞGF' in mark_upper:
        case = 'þgf'
    elif 'ÞF' in mark_upper:
        case = 'þf'
    elif 'NF' in mark_upper:
        case = 'nf'
    elif 'EF' in mark_upper:
        case = 'ef'

    # Number detection
    if 'FT' in mark_upper:
        number = 'ft'
    elif 'ET' in mark_upper:
        number = 'et'

    # Gender from word_class column
    gender = ''
    wc_lower = word_class.lower()
    if wc_lower == 'kk':
        gender = 'kk'
    elif wc_lower == 'kvk':
        gender = 'kvk'
    elif wc_lower == 'hk':
        gender = 'hk'

    return (case, gender, number)


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
    # word -> set of (lemma, pos, case, gender, number) tuples
    word_to_lemma_morph = defaultdict(set)

    with open(SRC_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        for i, row in enumerate(reader):
            if len(row) >= 6:
                # SHsnid.csv format: lemma;id;word_class;domain;word_form;mark
                lemma, bin_id, word_class, domain, word_form, mark, *rest = row
                lemma_lower = lemma.lower()
                word_lower = word_form.lower()
                pos = POS_MAP.get(word_class, word_class[:2] if len(word_class) >= 2 else word_class)
                case, gender, number = parse_mark(mark, word_class)
                word_to_lemma_morph[word_lower].add((lemma_lower, pos, case, gender, number))
            elif len(row) >= 5:
                # Fallback for rows without mark field
                lemma, bin_id, word_class, domain, word_form, *rest = row
                lemma_lower = lemma.lower()
                word_lower = word_form.lower()
                pos = POS_MAP.get(word_class, word_class[:2] if len(word_class) >= 2 else word_class)
                word_to_lemma_morph[word_lower].add((lemma_lower, pos, '', '', ''))
            if i > 0 and i % 1000000 == 0:
                print(f"  Processed {i:,} rows...")

    print(f"  Total word forms: {len(word_to_lemma_morph):,}")

    # Build unique lemma list sorted by frequency
    all_lemmas = set()
    for lemma_morph_set in word_to_lemma_morph.values():
        for lemma, *_ in lemma_morph_set:
            all_lemmas.add(lemma)

    def lemma_sort_key(lemma):
        freq = unigram_freqs.get(lemma, 0)
        return (-freq, lemma)

    lemma_list = sorted(all_lemmas, key=lemma_sort_key)
    lemma_to_idx = {lemma: idx for idx, lemma in enumerate(lemma_list)}
    print(f"  Unique lemmas: {len(lemma_list):,}")

    # Sort words alphabetically for binary search
    sorted_words = sorted(word_to_lemma_morph.keys())
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

    # Build entry data (lemma index + POS + morph packed)
    print("Building entry data...")
    all_entries = []
    entry_offsets = [0]  # Start offset for each word's entries

    for word in sorted_words:
        lemma_morph_set = word_to_lemma_morph[word]

        # Sort by frequency
        def sort_key(lm):
            lemma, pos, case, gender, number = lm
            freq = unigram_freqs.get(lemma, 0)
            return (-freq, lemma, pos, case, gender, number)

        sorted_entries = sorted(lemma_morph_set, key=sort_key)

        for lemma, pos, case, gender, number in sorted_entries:
            lemma_idx = lemma_to_idx[lemma]
            pos_code = POS_TO_CODE.get(pos, 10)  # 10 = unknown
            case_code = CASE_TO_CODE.get(case, 0)
            gender_code = GENDER_TO_CODE.get(gender, 0)
            number_code = NUMBER_TO_CODE.get(number, 0)

            # Pack into u32:
            # bits 0-3:   pos (4 bits, values 0-15)
            # bits 4-6:   case (3 bits, values 0-4)
            # bits 7-8:   gender (2 bits, values 0-3)
            # bit 9:      number (1 bit, values 0-1)
            # bits 10-29: lemmaIdx (20 bits, up to 1M lemmas)
            packed = (
                (lemma_idx << 10) |
                (number_code << 9) |
                (gender_code << 7) |
                (case_code << 4) |
                pos_code
            )
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
    print("\nVerification samples (with morph):")
    test_words = ['við', 'á', 'hestinum', 'fara', 'góðan']
    for word in test_words:
        if word in word_to_sorted_idx:
            idx = word_to_sorted_idx[word]
            start = entry_offsets[idx]
            end = entry_offsets[idx + 1]
            entries = all_entries[start:end]
            lemmas = []
            for e in entries[:3]:
                # Unpack: bits 10-29=lemmaIdx, bit 9=number, bits 7-8=gender, bits 4-6=case, bits 0-3=pos
                lemma_idx = e >> 10
                number_code = (e >> 9) & 0x1
                gender_code = (e >> 7) & 0x3
                case_code = (e >> 4) & 0x7
                pos_code = e & 0xF
                lemma = lemma_list[lemma_idx]
                pos = CODE_TO_POS.get(pos_code, '??')
                case = CODE_TO_CASE.get(case_code, '')
                gender = CODE_TO_GENDER.get(gender_code, '')
                number = CODE_TO_NUMBER.get(number_code, '')
                morph = f"{case}/{gender}/{number}" if (case or gender or number) else ""
                lemmas.append(f"{lemma}:{pos}" + (f"[{morph}]" if morph else ""))
            print(f"  {word} → {', '.join(lemmas)}")

    return 0


if __name__ == "__main__":
    exit(main())
