# lemma-is

Fast Icelandic lemmatization for JavaScript. Built for search indexing.

```typescript
import { BinaryLemmatizer, extractIndexableLemmas } from "lemma-is";

lemmatizer.lemmatize("börnin");   // → ["barn"]
lemmatizer.lemmatize("keypti");   // → ["kaupa"]
lemmatizer.lemmatize("hestinum"); // → ["hestur"]

// Full pipeline for search
extractIndexableLemmas("Börnin keypti hestinn", lemmatizer);
// → ["barn", "kaupa", "hestur"]
```

## The Problem

Icelandic is heavily inflected. A single noun like "hestur" (horse) has 16 forms:

```
hestur, hest, hesti, hests, hestar, hesta, hestum, hestanna...
```

If a user searches "hestur" but your document contains "hestinum", they won't find it—unless you normalize both to the lemma at index time.

## Why lemma-is?

The gold standard for Icelandic NLP is [GreynirEngine](https://github.com/mideind/GreynirEngine)—a full grammatical parser with excellent accuracy. But it's Python-only, which means you can't run it in Node.js, browsers, or edge runtimes without FFI or a sidecar process.

lemma-is trades parsing accuracy for JavaScript portability. It's a lookup table with shallow grammar rules—good enough for search indexing, runs anywhere Node.js runs.

| | lemma-is | GreynirEngine |
|---|---|---|
| **Runtime** | Node, Bun, Deno | Python |
| **Throughput** | ~250K words/sec | ~25K words/sec |
| **Cold start** | ~35 ms | ~500 ms |
| **Memory** | ~185 MB | ~200 MB |
| **Disambiguation** | Bigrams + grammar rules | Full sentence parsing |
| **Use case** | Search indexing | NLP analysis |

See [BENCHMARKS.md](./BENCHMARKS.md) for methodology and detailed results.

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
import { CompoundSplitter, createKnownLemmaSet } from "lemma-is";

const knownLemmas = createKnownLemmaSet(lemmatizer.getAllLemmas());
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

## PostgreSQL Full-Text Search

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

To load the full binary:

```typescript
const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
```

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
