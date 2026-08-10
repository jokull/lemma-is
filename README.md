# lemma-is

Fast Icelandic lemmatization for JavaScript. Built for search indexing.

```typescript
import { BinaryLemmatizer, extractIndexableLemmas, buildSearchQuery, highlight } from "lemma-is";

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

## Background

Icelandic is underserved in the search ecosystem:

- **PostgreSQL** has no Icelandic stemmer ([Snowball](https://snowballstem.org/) doesn't support it)
- **Elasticsearch** has no Icelandic analyzer in its [36 built-in languages](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html)
- **Algolia** lists Icelandic but only provides basic plurals—no morphological analysis
- **Existing Icelandic NLP tools** ([Greynir](https://github.com/mideind/GreynirPackage), [Nefnir](https://github.com/jonfd/nefnir)) are Python-only

For comparison, Finnish has [Voikko](https://voikko.puimula.org/) with PostgreSQL and Elasticsearch plugins. Icelandic has had nothing equivalent—until now.

lemma-is is the first npm package providing Icelandic lemmatization for search. It embeds the [BÍN](https://bin.arnastofnun.is/) morphological database and runs anywhere JavaScript runs.

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
| **Memory (load)** | ~19.2 MB | ~219.8 MB | ~417 MB RSS |
| **Parse failures** | n/a | n/a | 27% (sample) |
| **Disambiguation** | Bigrams + grammar rules | Bigrams + grammar rules | Full grammar + BÍN |
| **Use case** | Search indexing | Search indexing | NLP analysis |

See [BENCHMARKS.md](./BENCHMARKS.md) for methodology and detailed results.
The IFD gold corpus is referenced here: `https://repository.clarin.is/repository/xmlui/handle/20.500.12537/36`.
GreynirEngine numbers are from full sentence parsing on a 1,000-sentence IFD sample; parse failures and tokenization mismatches lower measured recall. The bintokenizer-based lemmatizer is more forgiving but overindexes heavily when all lemmas are kept.

### Optimization summary (0.5.0)

- **Core memory**: ~19.2 MB load (heap + ArrayBuffers) for `lemma-is.core.bin`
- **Full memory**: ~219.8 MB load for `lemma-is.bin`
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

## Defaults, Output, and Tuning

lemma-is has sensible defaults for search indexing — but the defaults are a *tradeoff*, and it pays to know what they produce before you ship. The short version:

- **What you get:** every candidate lemma of every word (recall first — an ambiguous word indexes all its readings), compounds split into their parts, stopwords dropped, number-like tokens skipped. A document with "Ég á bíl" indexes `eiga` and `bíl`; a search for "eiga" finds it.
- **What it costs:** memory (pick your binary) and some overindexing (ambiguous words add readings that aren't the intended sense).
- **If you want to tweak:** the pipeline flags, compound splitter mode, and curated lists below.

### What the defaults produce

`extractIndexableLemmas(text, lemmatizer, { removeStopwords: true })` gives you:

- **All candidate lemmas of ambiguous words.** `"á"` indexes `["á", "eiga", "ær"]` (preposition "on", verb "owns", ewe dative). This is deliberate — you'd rather show an extra result than miss a relevant document. See `indexAllCandidates` if you want precision instead.
- **Compound splits.** `húsnæðislán` indexes `húsnæði` + `lán` too, so a search for "lán" finds mortgage documents.
- **No function words** (`í`, `er`, `með`, ...) — see `useContextualStopwords` for a smarter variant.
- **No numbers/URLs/emails/dates** — skipped unless you set `includeNumbers: true`.
- **Unknown word forms** fall back to real dictionary lemmas (never the stripped string itself) — a word that still resolves to nothing is returned unchanged.

### Memory: pick your binary

Two binaries ship in `data-dist/`; the only difference is coverage and memory:

| Binary | Size | Use for |
|---|---|---|
| `lemma-is.bin` | ~110 MB | Node/Bun/Deno servers, max coverage (98.6% IFD recall) |
| `lemma-is.core.bin` | ~9-11 MB | Browser, edge, serverless — lower memory, ~96% recall |

The full binary is the default recommendation for servers where the model loads once at startup; core is for runtimes where cold start and download size matter.

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer } from "lemma-is";

const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
// .slice() hands loadFromBuffer a view of the file's underlying ArrayBuffer
// instead of copying the whole 110 MB
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
```

### Tuning the pipeline

All pipeline handles accept `removeStopwords`, and:

- `useContextualStopwords: true` — drop stopwords only in their function-word sense. `"Ég á bíl"` keeps `eiga` (verb), `"Bókin er á borðinu"` still drops `á` (preposition). Off by default (simple surface-form stopword list).
- `indexAllCandidates: false` — index only the disambiguated best guess instead of every candidate lemma. Tighter index, misses ambiguous readings.
- `includeNumbers: true` — index dates, times, URLs, emails, percents, phone numbers (normalized) instead of skipping them.
- `includeOriginal` — also index the raw surface form alongside its lemmas.
- `bigrams` / `compoundSplitter` — pass the lemmatizer (it implements `BigramProvider`) and/or a `CompoundSplitter` to enable disambiguation and compound splitting.

### Tuning compound splitting

`CompoundSplitter` takes a `KnownLemmaLookup` (see `createKnownLemmaSet` / `createKnownLemmaFilter`) and options:

```typescript
const splitter = new CompoundSplitter(lemmatizer, knownLemmas, {
  mode: "balanced",      // "aggressive" | "balanced" | "conservative"
  minPartLength: 3,      // shorter parts (e.g. "ís" in "ísland") allowed below 3
  tryLinkingLetters: true, // try removing linking s/u/a at the junction
});
```

The splitter's curated lists are exported and extensible — add your own never-split words or derivational suffixes:

```typescript
import { PROTECTED_LEMMAS, DERIVATIONAL_SUFFIX_LEMMAS } from "lemma-is";
PROTECTED_LEMMAS.add("mittfirnarnafn");        // stop splitting a word
DERIVATIONAL_SUFFIX_LEMMAS.add("lingur");      // never split before these
```

(`PROTECTED_LEMMAS` and `DERIVATIONAL_SUFFIX_LEMMAS` are shared module state — mutating them affects every splitter in the process.)

### Handle reference

Everything above, in one place:

| Handle | Returns |
|---|---|
| `lemmatizer.lemmatize(word, opts?)` | `string[]` — all candidate lemmas (with unknown-form fallback) |
| `lemmatizer.lemmatizeWithPOS(word)` | `{ lemma, pos }[]` — candidates with word class |
| `lemmatizer.lemmatizeWithMorph(word)` | `{ lemma, pos, morph }[]` — plus case/gender/number |
| `lemmatizer.isKnown(word)` | `boolean` — word form is in the dictionary (no fallback applied) |
| `lemmatizer.getAllLemmas()` | `string[]` — every lemma, for building `CompoundSplitter` lookups |
| `processText(text, lemmatizer, opts)` | `ProcessedToken[]` — per-token lemmas, disambiguated guess, confidence, compound splits |
| `extractIndexableLemmas(text, lemmatizer, opts)` | `Set<string>` — unique indexable lemmas (stopwords/compounds applied) |
| `extractDisambiguatedLemmas(text, lemmatizer, bigrams, opts)` | `Set<string>` — one best-guess lemma per token, bigram-disambiguated |
| `buildSearchQuery(text, lemmatizer, opts)` | `{ groups, query }` — for backend query construction |
| `highlight(query, text, lemmatizer, opts?)` | `HighlightResult` — segments with match spans |
| `extractSnippets(query, text, lemmatizer, opts?)` | `SnippetResult` — ranked, non-overlapping snippets |

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

// BinaryLemmatizer implements BigramProvider, so the same instance
// supplies both the lemmatizer and the bigram frequencies
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

For BM25 ranking via [pg_textsearch](https://github.com/timescale/pg_textsearch), see [`examples/pg-textsearch-bm25`](examples/pg-textsearch-bm25) — a Docker-based comparison of `ts_rank` vs BM25 with and without lemmatization.

## Highlighting Search Results

After finding matching documents, highlight the query terms in the original text:

```typescript
import { highlight } from "lemma-is";

const result = highlight("hestur", "Hestarnir eru á beitinni.", lemmatizer);
// result.matchCount = 1
// result.segments = [
//   { text: "Hestarnir", highlight: true },
//   { text: " eru á beitinni.", highlight: false }
// ]
```

The highlight function lemmatizes both query and document, finding matches across inflections. "hestur" matches "Hestarnir" because both normalize to the lemma "hestur".

Render the segments however fits your UI:

```typescript
// React example
result.segments.map((seg, i) =>
  seg.highlight ? <mark key={i}>{seg.text}</mark> : seg.text
);

// HTML string
result.segments.map(seg =>
  seg.highlight ? `<mark>${seg.text}</mark>` : seg.text
).join("");
```

### Snippet Extraction

For long documents, extract the most relevant snippets instead of highlighting the entire text:

```typescript
import { extractSnippets } from "lemma-is";

const doc = `Langt áður fyrr bjó maður á bæ. Hestarnir voru margir og góðir.
Þeir gengu á fjöllum. Maðurinn unni hestunum sínum mjög.`;

const result = extractSnippets("hestur", doc, lemmatizer, {
  snippetWords: 10,   // ~10 words per snippet
  maxSnippets: 3,     // up to 3 snippets
  ellipsis: "…",      // truncation marker
});

// result.totalMatches = 2
// result.snippets[0] = {
//   text: "…Hestarnir voru margir og góðir.…",
//   segments: [
//     { text: "…", highlight: false },
//     { text: "Hestarnir", highlight: true },
//     { text: " voru margir og góðir.…", highlight: false }
//   ],
//   score: 11,  // match density score
//   start: 32,  // offset in original
//   end: 64
// }
```

Snippets are ranked by match density and selected to avoid overlap. Use `segments` for custom rendering or `text` for display.

## Limitations

This is an early effort with known limitations.

### File Size

There are two binaries:

- **Core (~9-11 MB)**: default, optimized for browser/edge/cold start
- **Full (~110 MB)**: maximum coverage and disambiguation

Both ship in the npm package. The full binary targets Node.js servers where data loads once at startup. Not recommended for:

- **Serverless/edge** — cold start loading ~110 MB may be slow
- **Browser** — download size prohibitive
- **Cloudflare Workers** — fits 128 MB limit but cold starts are slow

For browser apps, use the **core** binary.

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer } from "lemma-is";

// Full model (max coverage; ~110 MB)
const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
```

### Unknown Form Fallback

When a word form is missing from the model (below the core model's frequency cutoff, or a BÍN gap like `skógs`), `lemmatize()` strips common inflectional endings and re-looks-up the stem — `skógs` → `skógur`, `kýrnanna` → `kýr`, `óxum` → `vaxa`. Only real dictionary lemmas are returned; the stripped string itself is never a lemma. A word that still resolves to nothing returns itself unchanged (callers can detect this as `result[0] === input`).

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
// → ["á", "eiga", "ær"] — preposition "on", verb "owns", noun "ewe" (dative)
```

For search indexing, use `indexAllCandidates: true` (the default) to index all lemmas.

### No Query Expansion

You can go word → lemma but not lemma → words. If you need to show all inflected forms of a lemma, you'll need to build a reverse mapping from BÍN data.

## Data

Single binary file containing:
- 346K lemmas from BÍN
- 3.70M word form mappings
- 414K bigram frequencies
- Morphological features per word form

The exact BÍN snapshot, build commands, counts, sizes, and output hashes are
recorded in [`BINARY_DATA_MANIFEST.json`](./BINARY_DATA_MANIFEST.json).

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
