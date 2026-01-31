# lemma-is

Fast Icelandic lemmatization for JavaScript. Built for search indexing.

```typescript
import { BinaryLemmatizer, extractIndexableLemmas, buildSearchQuery } from "lemma-is";

lemmatizer.lemmatize("börnin");   // → ["barn"]
lemmatizer.lemmatize("keypti");   // → ["kaupa"]
lemmatizer.lemmatize("hestinum"); // → ["hestur"]

// Full pipeline for search
extractIndexableLemmas("Börnin keypti hestinn", lemmatizer);
// → ["barn", "kaupa", "hestur"]

// Query normalization (backend-agnostic)
buildSearchQuery("bílaleigur", lemmatizer);
// → { groups: [["bílaleiga"]], query: "bílaleiga" }
```

## The Problem

Icelandic is heavily inflected. A single noun like "hestur" (horse) has 16 forms:

```
hestur, hest, hesti, hests, hestar, hesta, hestum, hestanna...
```

If a user searches "hestur" but your document contains "hestinum", they won't find it—unless you normalize both to the lemma at index time.

## Why lemma-is?

GreynirEngine remains the gold standard for **sentence parsing** and grammatical analysis in Icelandic. But full parsing is not forgiving: if a sentence doesn't parse, you don't get disambiguated lemmas. That makes it a poor fit for messy, real‑world search indexing where recall matters.

GreynirEngine also exposes a non‑parsing lemmatizer via its `bintokenizer`/`simple_lemmatize` pipeline, which can return all possible lemmas for a token. This is more forgiving but **overindexes heavily** without sentence‑level disambiguation.

lemma-is targets this gap: high‑recall lemmatization for search, tolerant of noise, with light disambiguation and compound splitting, and it runs anywhere JavaScript runs.

IFD benchmark summary (lemma recall + overindexing measured against gold lemmas in the Icelandic Frequency Dictionary corpus):

| | lemma-is core | lemma-is full | GreynirEngine (BÍN lookup) |
|---|---|---|---|
| **Runtime** | Node, Bun, Deno | Node, Bun, Deno | Python |
| **Throughput** | ~19.0M words/min | ~14.7M words/min | ~13.3K words/min |
| **Recall (IFD)** | 95.996% | 98.585% | 81.4% (parsed-only) |
| **Avg candidates** | 1.57 | 1.57 | 1.0 |
| **Overindexing (extraRate)** | 0.388 | 0.373 | 0.186 |
| **Memory (load)** | ~18.5 MB | ~182 MB | ~417 MB RSS |
| **Parse failures** | n/a | n/a | 27% (sample) |
| **Disambiguation** | Bigrams + grammar rules | Bigrams + grammar rules | Full grammar + BÍN |
| **Use case** | Search indexing | Search indexing | NLP analysis |

See [BENCHMARKS.md](./BENCHMARKS.md) for methodology and detailed results.
The IFD gold corpus is referenced here: `https://repository.clarin.is/repository/xmlui/handle/20.500.12537/36`.
GreynirEngine numbers are from full sentence parsing on a 1,000-sentence IFD sample; parse failures and tokenization mismatches lower measured recall. The bintokenizer-based lemmatizer is more forgiving but overindexes heavily when all lemmas are kept.

### Optimization summary (0.5.0)

- **Core memory**: ~18.5 MB load (heap + ArrayBuffers) for `lemma-is.core.bin`
- **Full memory**: ~182 MB load for `lemma-is.bin`
- **Greynir full parser memory**: ~417 MB RSS (sample run)
- **Core speed**: ~19.0M words/min; **Full speed**: ~14.7M words/min
- **Core recall**: 95.996% on IFD; **Full recall**: 98.585%
- **Core recall boost**: unknown‑word suffix fallback enabled only in core to raise recall without hurting full
- **Lower memory compound lookup**: Bloom filter known‑lemma lookup reduces RAM when splitting compounds

### The Trade-off

lemma-is returns **all possible lemmas** for ambiguous words:

```typescript
lemmatizer.lemmatize("á");
// → ["á", "eiga"]
// Could be preposition "on", noun "river", or verb "owns"
```

GreynirEngine parses the sentence to return the single correct interpretation. For search, returning all candidates is often better—you'd rather show an extra result than miss a relevant document.

## Installation

```bash
npm install lemma-is
```

## Quick Start

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer, extractIndexableLemmas } from "lemma-is";

// Load the core binary (~9-11 MB, low memory, best for browser/edge)
const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.core.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

// Basic lemmatization
lemmatizer.lemmatize("börnin");  // → ["barn"]
lemmatizer.lemmatize("fóru");    // → ["fara", "fóra"]

// Full pipeline for search indexing
const lemmas = extractIndexableLemmas("Börnin fóru í bíó", lemmatizer);
// → ["barn", "fara", "fóra", "í", "bíó"]
```

## Features

### Morphological Features

The binary includes case, gender, and number for each word form:

```typescript
lemmatizer.lemmatizeWithMorph("hestinum");
// → [{ lemma: "hestur", pos: "no", morph: { case: "þgf", gender: "kk", number: "et" } }]
// dative, masculine, singular
```

### Grammar-Based Disambiguation

Shallow grammar rules use Icelandic case government to disambiguate prepositions:

```typescript
import { Disambiguator } from "lemma-is";

const disambiguator = new Disambiguator(lemmatizer, lemmatizer, { useGrammarRules: true });

// "á borðinu" - borðinu is dative, á governs dative → preposition
disambiguator.disambiguate("á", null, "borðinu");
// → { lemma: "á", pos: "fs", resolvedBy: "grammar_rules" }
```

### Compound Splitting

Icelandic forms long compounds. Split them for better search coverage:

```typescript
import { CompoundSplitter, createKnownLemmaFilter } from "lemma-is";

const knownLemmas = createKnownLemmaFilter(lemmatizer.getAllLemmas());
const splitter = new CompoundSplitter(lemmatizer, knownLemmas);

splitter.split("landbúnaðarráðherra");
// → { isCompound: true, parts: ["landbúnaður", "ráðherra"] }
// "agriculture minister"
```

### Full Pipeline

For production indexing, combine everything:

```typescript
import { extractIndexableLemmas, CompoundSplitter, createKnownLemmaSet } from "lemma-is";

const knownLemmas = createKnownLemmaSet(lemmatizer.getAllLemmas());
const splitter = new CompoundSplitter(lemmatizer, knownLemmas);

const text = "Ríkissjóður stendur í blóma ef milljarða arðgreiðsla er talin með.";

const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams: lemmatizer,
  compoundSplitter: splitter,
  removeStopwords: true,
});

// Indexed: ríkissjóður, ríki, sjóður, standa, blómi, milljarður,
//          arðgreiðsla, arður, greiðsla, telja
// Stopwords removed: í, ef, er, með
```

A search for "sjóður" or "arður" now finds this document.

## Query Normalization (Backend-Agnostic)

Use the same lemmatization pipeline for **search queries** as for documents.
The helper returns grouped terms plus a boolean query string:

```typescript
import { buildSearchQuery } from "lemma-is";

const { groups, query } = buildSearchQuery("bílaleigur", lemmatizer, {
  removeStopwords: true,
});

// groups: [["bílaleiga"]]
// query: "bílaleiga"
```

You can swap operators to match your backend:

```typescript
// SQLite FTS5 prefers AND/OR
const sqlite = buildSearchQuery("við fórum í bíó", lemmatizer, {
  removeStopwords: true,
  andOperator: " AND ",
  orOperator: " OR ",
});

// Elasticsearch can use `groups` to build a bool query
// (OR within a group, AND across groups)
```

## PostgreSQL Full-Text Search (Example)

PostgreSQL has no built-in Icelandic stemmer. Use lemma-is to pre-process:

```typescript
const lemmas = extractIndexableLemmas(text, lemmatizer, { removeStopwords: true });

await db.query(
  `INSERT INTO documents (title, body, search_vector)
   VALUES ($1, $2, to_tsvector('simple', $3))`,
  [title, body, Array.from(lemmas).join(" ")]
);
```

Use the `simple` configuration—it lowercases but doesn't stem, since our lemmas are already normalized.

**Important:** Don't use PostgreSQL's `unaccent` extension for Icelandic. Characters like á, ö, þ, ð are distinct letters, not accented variants.

For queries:

```typescript
const { query } = buildSearchQuery(userQuery, lemmatizer, { removeStopwords: true });
const sql = `SELECT * FROM documents WHERE search_vector @@ to_tsquery('simple', $1)`;
await db.query(sql, [query]);
```

## Limitations

This is an early effort with known limitations.

### File Size

There are two binaries:

- **Core (~9-11 MB)**: default, optimized for browser/edge/cold start
- **Full (91 MB)**: maximum coverage and disambiguation

The full binary targets Node.js servers where data loads once at startup. Not recommended for:

- **Serverless/edge** — cold start loading 91 MB may be slow
- **Browser** — download size prohibitive
- **Cloudflare Workers** — fits 128 MB limit but cold starts are slow

For browser apps, use the **core** binary.

To use the full binary, build it locally:

```bash
pnpm build:binary
```

Then load it from `data-dist/lemma-is.bin`.

### Compact Builds (Browser/Edge)

For cold-start runtimes and the browser, you can build a **compact core** binary that trades accuracy for size by:
- Keeping only the most frequent word forms
- Dropping bigram data and morphological features

This reduces memory significantly at the cost of recall/precision on rare words.

```bash
pnpm build:core
```

The output is written to `data-dist/lemma-is.core.bin`. Use it exactly like the full binary; it just covers fewer word forms.

### Not a Parser

This is a lookup table with shallow grammar rules, not a grammatical parser. It doesn't understand sentence structure, named entities, or semantic meaning. The grammar rules help with common patterns but can't handle all disambiguation.

For applications needing full grammatical analysis, use [GreynirEngine](https://github.com/mideind/GreynirEngine).

### Disambiguation Limits

Bigram disambiguation only works when the word pair exists in corpus data. Without context, ambiguous words return all candidates:

```typescript
lemmatizer.lemmatize("á");
// → ["á", "eiga"] — no way to know which is more likely
```

For search indexing, use `indexAllCandidates: true` (the default) to index all lemmas.

### No Query Expansion

You can go word → lemma but not lemma → words. This affects search result highlighting—if a user searches "hestur" and the document contains "hestinum", you can't easily highlight the match.

## Data

Single binary file containing:
- 289K lemmas from BÍN
- 3M word form mappings
- 414K bigram frequencies
- Morphological features per word form

### Building Data

```bash
# Download BÍN data from https://bin.arnastofnun.is/DMII/LTdata/k-LTdata/
# Extract SHsnid.csv to data/

uv run python scripts/build-binary.py
```

## Development

```bash
pnpm test           # run tests
pnpm build          # build dist/
pnpm typecheck      # type check
```

## Acknowledgments

- **[BÍN](https://bin.arnastofnun.is/)** — Morphological database from the Árni Magnússon Institute
- **[Miðeind](https://mideind.is/)** — GreynirEngine and foundational Icelandic NLP work
- **[tokenize-is](https://github.com/axelharri/tokenize-is)** — Icelandic tokenizer

## License

MIT for the code.

### Data License (BÍN)

The linguistic data is derived from [BÍN](https://bin.arnastofnun.is/) © Árni Magnússon Institute for Icelandic Studies.

**By using this package, you agree to BÍN's conditions:**
- Credit the Árni Magnússon Institute in your product
- Do not redistribute the raw data separately
- Do not publish inflection paradigms without permission

Full terms: [BÍN License Conditions](https://bin.arnastofnun.is/DMII/LTdata/conditions/)
