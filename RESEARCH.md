# Greynir WASM Research

Goal: Run Icelandic stemming/lemmatization in the browser for search indexing.

## Problem Statement

Icelandic stemming is complex because:
- Rich morphology: 6+ million word forms, 300k lemmas
- Ambiguous word forms: "við" = wood OR us (context-dependent)
- Sentence structure needed for disambiguation
- No existing JavaScript/TypeScript Icelandic NLP tools

## Greynir Architecture

```
Greynir (reynir on PyPI)
├── Tokenizer (tokenizer on PyPI) ← tokenize-ts exists!
├── GreynirEngine (greynirengine on PyPI)
│   ├── Earley parser (C++ core, 10% of codebase)
│   └── 7000+ CFG production rules
└── BinPackage (islenska on PyPI)
    ├── BÍN database: 82MB compressed, 400MB+ raw
    ├── C++ files: bin.cpp, bincompress.cpp, dawgdictionary.cpp
    ├── DAWG structures for compound words
    └── CFFI bindings
```

## Approaches Evaluated

### 1. Pyodide + Full Greynir Stack

**Complexity: Very High**

Requirements:
- Compile C++ extensions to WASM (bin.cpp, dawgdictionary.cpp, parser core)
- CFFI now supported in Pyodide, but compile-time CFFI generation problematic
- 82MB+ data files to load in browser
- Full Python runtime (~15-20MB)

Challenges:
- GreynirEngine C++ parser would need Emscripten port
- BinPackage C++ DAWG/compression code needs porting
- Cold start: potentially 100MB+ download
- No pre-built WASM wheels exist for these packages

Feasibility: **Possible but heavyweight**

### 2. Pyodide + Nefnir (Pure Python Lemmatizer)

**Complexity: Medium**

[Nefnir](https://github.com/jonfd/nefnir) - rule-based lemmatizer:
- Pure Python 3.2+
- 99.55% accuracy on correctly tagged text
- Small data files: rules.json, tags.json
- **Requires POS-tagged input** (depends on IceNLP/IceStagger)

Could combine:
- tokenize-ts for tokenization (already done)
- Pyodide + Nefnir for lemmatization
- BUT: still need POS tagging solution

Challenges:
- POS tagging is the hard part
- Pyodide runtime overhead (~15-20MB)
- Still need IceStagger or equivalent

Feasibility: **Partial solution only**

### 3. REST API Backend

**Complexity: Low**

Use GreynirAPI (FastAPI) as a service:
- Full Greynir capabilities
- No browser constraints
- Self-host or use greynir.is (no public API documented)

Challenges:
- Not offline-capable
- Latency for each request
- Server infrastructure needed
- greynir.is doesn't expose public API endpoints

Feasibility: **Works but defeats offline goal**

### 4. Full TypeScript Port

**Complexity: Extreme**

Port entire stack to TypeScript like tokenize-ts:
- Tokenizer: Done (tokenize-ts)
- BÍN database: Convert to indexed binary or trie structure
- Earley parser: Reimplement in TS
- Grammar rules: Port 7000+ CFG rules

Effort estimate: Several person-months minimum

Feasibility: **Possible but enormous effort**

### 5. Hybrid: tokenize-ts + Simplified BÍN Lookup

**Complexity: Medium-High** ← Most promising

Approach:
1. Use tokenize-ts for tokenization (done)
2. Convert BÍN to JS-friendly format (SQLite WASM or custom trie)
3. Skip full parsing - use simpler heuristics
4. Accept lower accuracy for search indexing use case

Components needed:
- BÍN data extraction (CC BY-SA 4.0 licensed)
- Trie or compressed lookup structure in JS
- Simple disambiguation rules (most common lemma)

Trade-offs:
- "við" ambiguity won't be fully resolved
- Good enough for search (index all possible lemmas)
- Much smaller bundle size possible

Feasibility: **Best balance of effort vs capability**

### 6. sql.js (SQLite WASM) + BÍN Export

**Complexity: Medium**

Use SQLite compiled to WASM:
- sql.js is mature (~1MB WASM)
- Export BÍN to SQLite database
- Query word forms → lemmas directly

Benefits:
- No Python runtime needed
- Familiar query interface
- Can subset data for size

Challenges:
- Still need compound word handling
- Database size (~50-80MB?)
- No disambiguation

Feasibility: **Good for lookup-only use case**

## Data Sizes

| Component | Size | Notes |
|-----------|------|-------|
| Pyodide core | ~15-20MB | Python runtime |
| BÍN database | 82MB | Compressed binary |
| BÍN raw CSV | 400MB+ | Uncompressed |
| sql.js | ~1MB | SQLite WASM |
| tokenize-ts | 20KB | Minified |

## Recommendation

For **search indexing** (the stated goal), I recommend **Approach 5 or 6**:

### MVP Path:
1. **Use tokenize-ts** for tokenization (already available)
2. **Export BÍN subset** to SQLite or custom trie
3. **Multi-lemma indexing**: For ambiguous words, index ALL possible lemmas
4. **Skip full parsing**: Accept that "við" indexes as both "viður" and "við"

### Why this works for search:
- Search recall > precision for indexing
- User searching "við" will match both meanings anyway
- Can refine with query-time disambiguation if needed

### If full disambiguation needed:
- Consider hybrid: client-side tokenization + server-side lemmatization API
- Or invest in full TypeScript port (long-term)

## Implementation Status: lemma-is

**Approach 5 implemented** as `lemma-is` TypeScript package.

### What was built:
- Downloaded official BÍN CSV from [Árni Magnússon Institute](https://bin.arnastofnun.is/DMII/LTdata/data/)
- Extracted 3.7M word forms → 347K lemmas mapping
- Compressed to gzipped TSV format: **11.2 MB total**
- TypeScript library with browser DecompressionStream support

### Data files:
- `lemmas.txt.gz` (1.2 MB) - sorted list of all lemmas
- `lookup.tsv.gz` (10.0 MB) - word form → lemma index mapping

### Usage:
```typescript
import { Lemmatizer, extractLemmas } from 'lemma-is';

// Browser: load from URL
const lemmatizer = await Lemmatizer.load('/data/');

// Node.js: load from buffers
const lemmatizer = Lemmatizer.loadFromBuffers(lemmasGz, lookupGz);

// Lookup
lemmatizer.lemmatize('við');  // ['ég', 'við', 'viður']
lemmatizer.lemmatize('hesti'); // ['hesta', 'hestur']

// Extract for search indexing
extractLemmas('Við fórum út', lemmatizer);
// Set { 'ég', 'við', 'viður', 'fara', 'út' }
```

### Trade-off accepted:
- No disambiguation - returns ALL possible lemmas
- For search indexing this is fine (index all, let search rank)
- Full disambiguation would require the Greynir parser

## Disambiguation Research: icegrams

### Discovery: icegrams can disambiguate!

[icegrams](https://pypi.org/project/icegrams/) by Miðeind provides trigram frequencies from Icelandic text corpus.

**Key finding**: Bigram frequencies reliably distinguish word senses:

```
"Við erum" (we are):     93,046  → "við" = pronoun
"úr við" (from wood):       112  → "við" = noun (viður)
"við gluggann" (by window): 234  → "við" = preposition
```

### Data sizes

| Component | Size | Notes |
|-----------|------|-------|
| icegrams trigrams.bin | 41 MB | Compressed Elias-Fano encoding |
| icegrams _trie.so | 72 KB | C++ trie lookup |

### Disambiguation algorithm (theory)

```
1. Tokenize sentence (keep original word forms!)
2. For each word, get candidate lemmas from BÍN
3. If unambiguous → use that lemma
4. If ambiguous:
   a. Check morphology (definite suffix -ið/-inn → noun)
   b. Get bigram freq with prev/next word via icegrams
   c. Score each candidate: freq + word_class_weight
   d. Pick highest-scoring CONTENT word (noun/verb/adj)
5. Filter stopwords from final lemmas
```

### Proven examples

| Sentence | Ambiguous word | icegrams signal | Correct lemma |
|----------|---------------|-----------------|---------------|
| "Við fórum heim" | Við | "Við fórum" = 4,904 | ég (pronoun) → skip |
| "Borðið er úr við" | við | "úr við" = 112 | viður (wood) → index |
| "Hún stóð við gluggann" | við | "við gluggann" = 234 | við (prep) → skip |

### Open questions

1. **WASM compilation**: Can icegrams C++ trie be compiled to WASM?
2. **Data format**: Is trigrams.bin portable or Python-specific?
3. **Stopword handling**: Should keep original forms for trigram lookup, filter AFTER disambiguation

### Compound word handling

Greynir adds dashes to compound words (from planitor codebase):

```python
# "svala-handrið" → extract both:
#   - "handrið" (base word)
#   - "svalahandrið" (full compound)
```

The dash insertion happens during Greynir parsing - need the full parser for this.

## Trie-based approaches

### beygla: Icelandic name declension trie

[Blog post](https://alexharri.com/blog/icelandic-name-declension-trie) by Alex Harri describes compressing name declensions into 3.27 KB!

**Key insight**: Reversed trie + suffix encoding
- Names with same ending → same declension pattern
- Store pattern as suffix delta: `"ur,,i,ar"`
- Compress by merging identical subtrees

**Relevance**: Same approach could work for lemmatization:
- Words with same suffix often share lemmatization rules
- Could compress BÍN lookup significantly
- 3.7M word forms might compress to < 5MB?

## Implementation Status: Phase 2 - Disambiguation & Compounds

**Bigram-based disambiguation and compound splitting implemented.**

### New components:

| File | Size | Purpose |
|------|------|---------|
| `bigrams.json.gz` | 2.9 MB | 414K bigram frequencies (freq ≥ 50) |
| `src/bigrams.ts` | - | BigramLookup class |
| `src/disambiguate.ts` | - | Disambiguator using bigram context |
| `src/compounds.ts` | - | Heuristic compound word splitting |

### Total data budget:
- lemmas.txt.gz: 1.2 MB
- lookup.tsv.gz: 10.0 MB
- bigrams.json.gz: 2.9 MB
- **Total: 14.1 MB** (within 10-15MB target)

### Disambiguation algorithm (implemented):
```typescript
const disambiguator = new Disambiguator(lemmatizer, bigrams);
// Uses left + right context bigrams to score candidates
disambiguator.disambiguate("við", null, "erum");
// → scores "ég" higher due to "ég erum" bigram frequency
```

### Compound splitting (implemented):
```typescript
const splitter = new CompoundSplitter(lemmatizer, knownLemmas);
splitter.split("bílstjóri"); // → ["bíll", "stjóri"] if both known
```

## Lemmatizer Comparison: lemma-is vs Nefnir vs GreynirEngine

Tested three approaches to Icelandic lemmatization.

### What is a POS tagger?

**POS** = Part-of-Speech. A tagger labels each word with its grammatical role. Icelandic POS tags encode case/number/gender/tense:
- `nken` = noun (n), masculine (k), singular (e), nominative (n)
- `sfg3en` = verb (s), indicative (f), active (g), 3rd person (3), singular (e), present (n)

This is how "á" gets disambiguated:
- `á + af` (preposition tag) → lemma "á"
- `á + sfg3en` (verb tag) → lemma "eiga"
- `á + nven` (noun tag) → lemma "á" (river)

### Test Results

| Word | Expected | lemma-is | Nefnir (with POS) |
|------|----------|----------|-------------------|
| börnin | barn | ✓ barn | ✓ barn |
| fóru | fara | ✓ fara | ✓ fara |
| keyptu | kaupa | ✓ kaupa | ✓ kaupa |
| á | ambiguous | returns all: á, eiga | ✓ correct per tag |
| borgarstjóri | borg+stjóri | ✓ splits | ✗ no split |
| manninum | maður | ✓ maður | ✓ maður |
| kvenna | kona | ✓ kona | ✓ kona |

### Feature Comparison

| Feature | lemma-is | Nefnir | GreynirEngine |
|---------|----------|--------|---------------|
| **Approach** | BÍN lookup + bigrams | Rule-based suffix | Full CFG parser (7000+ rules) |
| **Input required** | Word only | Word + POS tag | Sentence |
| **POS tagging** | ✗ None (multi-lemma) | ✗ Needs external | ✓ Built-in (from parse) |
| **Disambiguation** | Bigram frequencies | Via POS tag input | Via sentence parsing |
| **Compound splitting** | ✓ Heuristic | ✗ No | ✓ Via parser |
| **Runtime** | TypeScript/Browser | Python | Python + C++ |
| **Data size** | ~14 MB | ~3 MB | ~100+ MB |
| **Offline browser** | ✓ | ✗ | ✗ |
| **Accuracy** | Good for search | 99.55% (with correct tags) | Gold standard |

### Nefnir: Needs a POS Tagger

Nefnir is **useless standalone**. From its README:

> Before a text file can be lemmatized, it first has to be tokenized and tagged by a tool such as **IceNLP** or **IceStagger**.

Pipeline required:
1. **IceStagger/IceNLP** (Java, research tools) → produces POS tags
2. **Nefnir** (Python) → uses tags to select lemma

Neither IceNLP nor IceStagger are actively maintained or browser-compatible.

### GreynirEngine: The Gold Standard

[GreynirEngine](https://github.com/mideind/GreynirEngine) does everything:
- Tokenization
- POS tagging (derived from parse tree)
- Lemmatization
- Compound word analysis
- Full syntactic parse trees

But it's **heavy**: C++ core, 100+ MB data, Python-only. Cannot run in browser.

### The Pipeline Hierarchy

```
GreynirEngine (full parser, 100+ MB)
    ↓ extracts POS tags + lemmas

Nefnir (needs POS tags from somewhere, 3 MB)
    ↓ or skip POS entirely

lemma-is (standalone, bigram disambiguation, 14 MB)
```

### Conclusion

| Use Case | Recommendation |
|----------|----------------|
| **Browser search indexing** | **lemma-is** - only viable option |
| **Server-side NLP** | **GreynirEngine** - includes everything |
| **With existing POS tagger** | Nefnir - small and accurate |

For our goal (offline browser search), lemma-is wins by default. The multi-lemma approach for ambiguous words is actually a feature for search recall.

## Known Limitations & Research Questions

*Documented through test cases in `tests/limitations.test.ts`*

### 1. Disambiguation without context
**Problem**: Single words with no surrounding context can't be disambiguated.
- "á" alone could be: preposition, river, or verb (eiga)
- Current behavior: returns all candidates with equal weight

**Research direction**:
- Extract unigram frequencies from icegrams (`storage.unigram_frequency(word_id)`)
- Use as tiebreaker: "á" as preposition is ~100x more common than "á" as river
- Estimated data size: ~1-2MB for top 100k words

### 2. Bigrams only, no trigrams
**Problem**: Lose context in 3+ word patterns.
- "ég á hest" (I own a horse) vs "ég er á hesti" (I am on a horse)
- Bigrams: "ég á", "á hest" vs "ég er", "er á", "á hesti"
- Trigrams would be clearer: "ég á hest" vs "er á hesti"

**Research direction**:
- icegrams has trigrams (41MB compressed)
- Could extract high-value trigrams only (freq > 1000) for ~5-10MB
- Alternative: Train small neural model on (prev, word, next) triples

### 3. No word class (POS) information
**Problem**: Can't filter by "only nouns" or "only verbs".
- Useful for search faceting or grammatical queries
- BÍN has this data, we don't expose it

**Research direction**:
- Store word class with lemmas: `"á:prep"`, `"eiga:verb"`
- Size impact: ~2-3MB additional
- Format: append to lemma indices: `word\tidx1:N,idx2:V`

### 4. Compound splitting is heuristic
**Problem**: May split at wrong boundaries or miss complex compounds.
- "landsins" (land + genitive) incorrectly detected as compound?
- "þjóðmálaráðherra" (3 parts) only split into 2

**Research direction**:
- Use BÍN compound prefix/suffix DAWG data
- Recursive splitting for multi-part compounds
- Balance precision vs over-splitting

### 5. Lemma order not frequency-ranked
**Problem**: `lemmatize("við")` returns `["við", "viður", "ég"]` in arbitrary order.
- "ég" (pronoun we) is far more common than "viður" (wood)
- Would help for "most likely" fallback

**Research direction**:
- Sort lemma indices by corpus frequency at build time
- Or: store frequency alongside indices

### 6. No morphological generation
**Problem**: Can go word→lemma but not lemma→word forms.
- Can't expand "hestur" to ["hestur", "hest", "hesti", "hests", ...]
- Useful for query expansion and highlighting

**Research direction**:
- Build inverse index: lemma → [word_forms]
- Size impact: significant (each lemma has 20-50+ forms)
- Alternative: BÍN paradigm tables (~50 paradigm classes)

### 7. No semantic similarity
**Problem**: Only exact lemma matching, no synonyms.
- "hestur" doesn't match "hross" (both mean horse)
- "maður" doesn't match "manneskja" (both mean human)

**Research direction**:
- Icelandic word embeddings exist (research projects)
- Size: 50-200MB for full embeddings
- Could use quantized/reduced versions for browser

## Compression Research: Trie vs TSV

**Finding: TSV+gzip is hard to beat.**

Tested approaches:
1. **trie-mapping (radix trie)**: 10.87 MB (9% larger than TSV)
2. **Reversed suffix trie**: 21.10 MB (111% larger than TSV)
3. **Original TSV+gzip**: 9.97 MB (winner)

**Why**: JSON overhead from nested objects. Gzip already handles repetitive patterns excellently.

**Alternative not tested**: Binary encoding (MessagePack, Protocol Buffers)
- Could potentially beat gzip by 10-20%
- But adds complexity + decode time

## Future improvements

1. [ ] Add unigram frequencies for disambiguation fallback (~1-2MB)
2. [ ] Store word class (POS) with lemmas (~2-3MB)
3. [ ] Extract high-value trigrams from icegrams (~5-10MB)
4. [ ] Recursive compound splitting
5. [ ] Frequency-ranked lemma order
6. [ ] Integration with tokenize-ts for full pipeline
7. [ ] WASM port of icegrams C++ trie for full trigram access

## References

### Miðeind packages
- [GreynirEngine](https://github.com/mideind/GreynirEngine) - Core NLP engine (C++ parser + Python)
- [GreynirPackage](https://github.com/mideind/GreynirPackage) - Full NLP parser
- [BinPackage (islenska)](https://github.com/mideind/BinPackage) - BÍN database
- [icegrams](https://pypi.org/project/icegrams/) - Trigram frequencies
- [Tokenizer](https://github.com/mideind/Tokenizer) - Icelandic tokenizer

### Other Icelandic NLP
- [Nefnir](https://github.com/jonfd/nefnir) - Pure Python lemmatizer
- [Kvistur](https://github.com/jonfd/kvistur) - Compound word splitter
- [atlijas/icelandic-stop-words](https://github.com/atlijas/icelandic-stop-words) - Stopwords
- [beygla](https://alexharri.com/blog/icelandic-name-declension-trie) - Trie compression for declension

### TypeScript/Browser
- [tokenize-ts](https://github.com/jokull/tokenize-ts) - TS tokenizer port
- [Pyodide](https://pyodide.org/) - Python WASM
- [sql.js](https://github.com/sql-js/sql.js) - SQLite WASM

### Data sources
- [BÍN download](https://bin.arnastofnun.is/DMII/LTdata/data/) - Official morphology database
- [Greynir docs](https://greynir.is/doc/)
