# lemma-is

Icelandic lemmatization for JavaScript. Maps inflected word forms to base forms (lemmas) for search indexing and text processing.

## Why?

Existing Icelandic NLP tools are Python/C++:

| Tool | Runtime | Standalone? | Notes |
|------|---------|-------------|-------|
| **[GreynirEngine](https://github.com/mideind/GreynirEngine)** | Python + C++ | ✓ | Gold standard. Full parser, POS tagger. |
| **[Nefnir](https://github.com/lexis-project/Nefnir)** | Python | ✗ | Requires POS tags from IceNLP/IceStagger (Java, unmaintained). |
| **lemma-is** | TypeScript | ✓ | Node.js servers. Grammar-based disambiguation, compound splitting. |

lemma-is trades parsing accuracy for JS ecosystem integration—good enough for search indexing, runs in any Node.js environment.

## Quickstart

```bash
npm install lemma-is
```

**Node.js**:
```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer, extractIndexableLemmas } from "lemma-is";

// Binary data is bundled with the package
const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);

lemmatizer.lemmatize("börnin");  // → ["barn"]
lemmatizer.lemmatize("fóru");    // → ["fara", "fóra"]

// Full pipeline for search indexing
const lemmas = extractIndexableLemmas("Börnin fóru í bíó", lemmatizer);
// → ["barn", "fara", "fóra", "í", "bíó"]
```

## The Problem

Icelandic is highly inflected. A single word appears in dozens of forms:

| Search term | Forms in documents |
|-------------|-------------------|
| hestur (horse) | hestinn, hestinum, hestar, hestarnir, hesta... |
| barn (child) | börnin, barnið, barna, börnum... |
| fara (go) | fór, fer, förum, fóru, farið... |
| kona (woman) | konuna, konunni, kvenna, konum... |

If you index "Börnin fóru í bíó" by splitting on whitespace, a search for "barn" finds nothing. The word "barn" never appears—only "börnin".

## Solution

```typescript
lemmatizer.lemmatize("börnin");   // → ["barn"]
lemmatizer.lemmatize("fóru");     // → ["fara"]
lemmatizer.lemmatize("kvenna");   // → ["kona"]
lemmatizer.lemmatize("hestinum"); // → ["hestur"]
```

Now searches for "barn", "fara", or "hestur" match documents containing any of their forms.

## Handling Ambiguity

Many Icelandic words map to multiple lemmas:

```typescript
lemmatizer.lemmatize("á");
// → ["á", "eiga"]
// "á" = preposition "on" / noun "river"
// "á" = verb "owns" (from "eiga")

lemmatizer.lemmatize("við");
// → ["við", "ég", "viður"]
// "við" = preposition "by/at"
// "við" = pronoun "we" (from "ég")
// "við" = noun "wood" (from "viður")
```

### Grammar Rules (Case Government)

The library uses shallow grammar rules based on Icelandic case government to disambiguate prepositions:

```typescript
import { Disambiguator } from "lemma-is";

// lemmatizer loaded as shown in Quickstart
const disambiguator = new Disambiguator(lemmatizer, lemmatizer, { useGrammarRules: true });

// "á borðinu" - borðinu is dative (þgf), á governs dative → preposition
disambiguator.disambiguate("á", null, "borðinu");
// → { lemma: "á", pos: "fs", resolvedBy: "grammar_rules" }

// "ég á" - pronoun before á → likely verb "eiga"
disambiguator.disambiguate("á", "ég", null);
// → { lemma: "eiga", pos: "so", resolvedBy: "preference_rules" }
```

### Morphological Features

The binary includes case, gender, and number for each word form:

```typescript
lemmatizer.lemmatizeWithMorph("hestinum");
// → [{
//   lemma: "hestur",
//   pos: "no",
//   morph: { case: "þgf", gender: "kk", number: "et" }
// }]
// "hestinum" = dative, masculine, singular

lemmatizer.lemmatizeWithMorph("börnum");
// → [{
//   lemma: "barn",
//   pos: "no",
//   morph: { case: "þgf", gender: "hk", number: "ft" }
// }]
// "börnum" = dative, neuter, plural
```

| Code | Meaning |
|------|---------|
| `nf` | nominative (nefnifall) |
| `þf` | accusative (þolfall) |
| `þgf` | dative (þágufall) |
| `ef` | genitive (eignarfall) |
| `kk` | masculine (karlkyn) |
| `kvk` | feminine (kvenkyn) |
| `hk` | neuter (hvorugkyn) |
| `et` | singular (eintala) |
| `ft` | plural (fleirtala) |

### Bigram Disambiguation

Use corpus frequencies to pick the most likely lemma based on context:

```typescript
import { processText } from "lemma-is";

// BinaryLemmatizer has built-in bigram frequencies for disambiguation
// "við erum" = "we are" → bigrams favor pronoun "ég" over preposition
const processed = processText("Við erum hér", lemmatizer, { bigrams: lemmatizer });
// → disambiguated: "ég" for "við" (high confidence)

// "á morgun" = "tomorrow" → bigrams favor preposition
const processed2 = processText("Ég fer á morgun", lemmatizer, { bigrams: lemmatizer });
// → disambiguated: "á" for "á" (not "eiga")
```

For search indexing, ambiguity is often acceptable—indexing all candidate lemmas improves recall.

## Compound Word Splitting

Icelandic forms long compounds. The library splits them for better search coverage:

```typescript
import { CompoundSplitter, createKnownLemmaSet } from "lemma-is";

const splitter = new CompoundSplitter(lemmatizer, knownLemmas);

splitter.split("bílstjóri");
// → { isCompound: true, parts: ["bíll", "stjóri"] }
// "car driver" = "car" + "driver"

splitter.split("landbúnaðarráðherra");
// → { isCompound: true, parts: ["landbúnaður", "ráðherra"] }
// "agriculture minister" = "agriculture" + "minister"

splitter.split("húsnæðislán");
// → { isCompound: true, parts: ["húsnæði", "lán"] }
// "housing loan" = "housing" + "loan"
```

### Indexing Compounds

`getAllLemmas` returns the original word plus its parts—maximizing search recall:

```typescript
splitter.getAllLemmas("bílstjóri");
// → ["bílstjóri", "bíll", "stjóri"]
```

A document mentioning "bílstjóri" is now findable by searching for "bíll" (car).

## Full Pipeline

For production indexing, combine tokenization, lemmatization, disambiguation, and compound splitting.

### What Gets Indexed

Here's a real example showing exactly what lemmas are extracted:

```typescript
const text = "Ríkissjóður stendur í blóma ef 27 milljarða arðgreiðsla Íslandsbanka er talin með.";

const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams: lemmatizer,
  compoundSplitter: splitter,
  removeStopwords: true,
});

// Indexed lemmas:
// ✓ ríkissjóður, ríki, sjóður     — compound + parts
// ✓ standa                        — stendur → standa
// ✓ blómi                         — í blóma → blómi
// ✓ milljarður                    — milljarða → milljarður
// ✓ arðgreiðsla, arður, greiðsla  — compound + parts
// ✓ íslandsbanki                  — proper noun (lowercased)
// ✓ telja                         — talin → telja
//
// NOT indexed (stopwords removed):
// ✗ í, ef, er, með
```

A search for "sjóður" or "arður" now finds this document about the state treasury and bank dividends.

### Another Example: Job Posting

```typescript
const posting = "Við leitum að reyndum kennurum til starfa í Reykjavík.";

const lemmas = extractIndexableLemmas(posting, lemmatizer, {
  bigrams: lemmatizer,
  removeStopwords: true,
});

// Indexed:
// ✓ leita, leit               — leitum → leita (+ noun variant)
// ✓ reyndur, reynd            — reyndum → reyndur
// ✓ kennari                   — kennurum → kennari
// ✓ starf, starfa             — starfa (noun + verb)
// ✓ reykjavík                 — place name (lowercased)
//
// NOT indexed:
// ✗ við, að, til, í           — stopwords
```

A search for "kennari" finds this job posting even though the word "kennari" never appears—only "kennurum" (dative plural).

### Complex Sentence

```typescript
const text = "Löngu áður en Jón borðaði ísinn sem hafði bráðnað hratt " +
             "fór ég á veitingastaðinn og keypti mér rauðvín með hamborgaranum.";

const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams: lemmatizer,
  compoundSplitter: splitter,
  removeStopwords: true,
});

// Verbs (various tenses/persons):
// ✓ borða      — borðaði (past)
// ✓ bráðna     — bráðnað (past participle)
// ✓ fara       — fór (past, different stem!)
// ✓ kaupa      — keypti (past)
//
// Nouns with articles:
// ✓ ís         — ísinn (NOT "Ísland"!)
// ✓ veitingastaður, veiting, staður  — compound
// ✓ rauðvín
// ✓ hamborgari — hamborgaranum (dative + article)
```

### Setup

```typescript
import { readFileSync } from "fs";
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
  CompoundSplitter,
  createKnownLemmaSet
} from "lemma-is";

const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
const knownLemmas = createKnownLemmaSet(lemmatizer.getAllLemmas());
const splitter = new CompoundSplitter(lemmatizer, knownLemmas);
```

### Search-Optimized Defaults

The defaults favor **recall over precision**—better for search where missing results is worse than extra results:

```typescript
const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams: lemmatizer,
  compoundSplitter: splitter,
  // These are the defaults:
  // indexAllCandidates: true  — indexes ALL lemma candidates
  // alwaysTryCompounds: true  — splits compounds even if known in BÍN
});
```

With these defaults:
- `"á"` → indexes both `"á"` (preposition) AND `"eiga"` (verb)
- `"húsnæðislán"` → indexes `"húsnæðislán"`, `"húsnæði"`, AND `"lán"`

### Precision Mode

If you need only the most likely lemma (chatbots, translation), disable the search optimizations:

```typescript
const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams: lemmatizer,
  compoundSplitter: splitter,
  indexAllCandidates: false,  // only disambiguated lemma
  alwaysTryCompounds: false,  // only split unknown words
});
```

## Word Classes

Filter by part of speech when context is known:

```typescript
lemmatizer.lemmatize("á", { wordClass: "so" }); // → ["eiga"] (verbs only)
lemmatizer.lemmatize("á", { wordClass: "fs" }); // → ["á"] (prepositions only)

lemmatizer.lemmatizeWithPOS("á");
// → [
//   { lemma: "á", pos: "fs" },   // preposition
//   { lemma: "á", pos: "no" },   // noun (river)
//   { lemma: "eiga", pos: "so" } // verb
// ]
```

| Code | Icelandic | English |
|------|-----------|---------|
| `no` | nafnorð | noun |
| `so` | sagnorð | verb |
| `lo` | lýsingarorð | adjective |
| `ao` | atviksorð | adverb |
| `fs` | forsetning | preposition |
| `fn` | fornafn | pronoun |

## Data

Single binary file: `lemma-is.bin` (~91 MB)

Contains:
- 289K lemmas from BÍN
- 3M word form mappings
- 414K bigram frequencies
- Morphological features (case, gender, number) per word form

Uses ArrayBuffer with binary search for efficient memory usage. Format version 2 includes packed morphological data.

### Building Data

```bash
# Download BÍN data from https://bin.arnastofnun.is/DMII/LTdata/k-LTdata/
# Extract SHsnid.csv to data/

uv run python scripts/build-binary.py    # builds lemma-is.bin with morph features
```

## Node.js Usage

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer } from "lemma-is";

const buffer = readFileSync("node_modules/lemma-is/data-dist/lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
```

## PostgreSQL Full-Text Search

PostgreSQL has no built-in Icelandic stemmer. Use lemma-is to pre-process text, then store lemmas in a `tsvector` column with the `simple` configuration.

```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT,
  body TEXT,
  search_vector TSVECTOR
);
CREATE INDEX documents_search_idx ON documents USING GIN (search_vector);
```

Lemmatize in your app, store as space-separated string:

```typescript
const lemmas = extractIndexableLemmas(text, lemmatizer, { removeStopwords: true });

await db.query(
  `INSERT INTO documents (title, body, search_vector)
   VALUES ($1, $2, to_tsvector('simple', $3))`,
  [title, body, Array.from(lemmas).join(" ")]
);
```

Query by lemmatizing search terms the same way:

```typescript
const lemmas = extractIndexableLemmas(query, lemmatizer);

const results = await db.query(
  `SELECT *, ts_rank(search_vector, q) AS rank
   FROM documents, plainto_tsquery('simple', $1) q
   WHERE search_vector @@ q
   ORDER BY rank DESC`,
  [Array.from(lemmas).join(" ")]
);

// User searches "börnum" → lemmatized to "barn" → matches all forms
```

**Why `simple`?** It lowercases but doesn't stem—our lemmas are already normalized. Use `setweight()` to boost title matches over body.

**Diacritics:** PostgreSQL's `unaccent` extension strips accents, but **don't use it for Icelandic**. Characters like á, ö, þ, ð are distinct letters, not accented variants. "á" (river/on/owns) ≠ "a". Preserve diacritics for correct matching.

## Limitations

This library makes tradeoffs for portability. Know what you're getting.

### File Size

The binary is **~91 MB**. This library targets Node.js server environments where the data is loaded once at startup.

Not recommended for:
- **Serverless/edge** — cold start latency loading 91 MB
- **Browser/Web Workers** — download size prohibitive for most users
- **Cloudflare Workers** — fits 128 MB limit but cold starts are slow

For browser applications, run lemmatization server-side and expose an API endpoint.

### No Query Expansion

You can go **word → lemma** but not **lemma → words**:

```typescript
lemmatizer.lemmatize("hestinum"); // → ["hestur"] ✓

// But you CANNOT do:
lemmatizer.expand("hestur");
// → ["hestur", "hest", "hesti", "hests", "hestinn", "hestinum", ...] ✗
```

This matters for **search result highlighting**. If a user searches "hestur" and the document contains "hestinum", you can't easily highlight the match without the reverse mapping.

**Workaround:** Store original text alongside lemmas, use regex patterns for common suffixes.

### Disambiguation Limits

Bigram disambiguation only works when the word pair exists in the corpus data:

```typescript
// Common phrase: bigrams help
processText("við erum", lemmatizer, { bigrams: lemmatizer });
// → "við" disambiguated to "ég" (we) with high confidence

// Rare/unusual phrase: no bigram data
processText("við flæktumst", lemmatizer, { bigrams: lemmatizer });
// → "við" picks first candidate, low confidence
```

Without context, ambiguous words fall back to arbitrary ordering:

```typescript
// Single word, no context
lemmatizer.lemmatize("á");
// → ["á", "eiga"] — but which is more likely? No way to know.

// The preposition "á" is ~100x more common than verb "eiga" in this form,
// but we don't have unigram frequencies to use as tiebreaker.
```

**For search indexing:** Use `indexAllCandidates: true` to index all lemmas and let ranking sort out relevance. For applications needing precision (chatbots, translation), use GreynirEngine instead.

### Compound Splitting Heuristics

The splitter uses simple rules that miss edge cases:

**Three-part compounds only split once:**
```typescript
splitter.split("þjóðmálaráðherra");
// → ["þjóðmál", "ráðherra"] — missing "þjóð" as separate part
// Ideal: ["þjóð", "mál", "ráðherra"]
```

**Inflected first parts may not match:**
```typescript
splitter.split("húseignir");
// → { isCompound: false } — "hús" appears as "hús" not "húsa"
// The compound IS "hús" + "eignir" but heuristics miss it
```

**May over-split valid words:**
```typescript
splitter.split("landsins");
// This is NOT a compound — it's "land" + genitive suffix "-sins"
// Correctly returns { isCompound: false }, but edge cases exist
```

**Mitigations:**
- Use `alwaysTryCompounds: true` to split even known words
- Use `minPartLength: 2` in CompoundSplitter for more aggressive splitting
- Over-indexing is usually better than under-indexing for search

### Not a Parser

This is a lookup table with shallow grammar rules, not a full grammatical parser. It doesn't understand:

- Full sentence structure or syntax trees
- Complex verb argument frames
- Named entity recognition (people, places, companies)
- Semantic meaning or word sense

The grammar rules help with common patterns (preposition + case, pronoun + verb) but can't handle all disambiguation cases. For applications needing full grammatical analysis, use [GreynirEngine](https://github.com/mideind/GreynirEngine). lemma-is is for search indexing where "good enough" recall beats perfect precision.

## Development

### Testing

Tests use [Vitest](https://vitest.dev/):

```bash
pnpm test           # run all tests
pnpm test:watch     # watch mode
npx vitest run --update  # update snapshots
```

Test files:
- `binary-lemmatizer.test.ts` — Core lemmatization and bigram lookup
- `compounds.test.ts` — Compound word splitting
- `integration.test.ts` — Full pipeline, search indexing options
- `pipeline-greynir.test.ts` — Full pipeline with Greynir test sentences
- `benchmark.test.ts` — Performance and metrics snapshots
- `icelandic-tricky.test.ts` — Edge cases, morphology examples
- `limitations.test.ts` — Documented limitations and research notes
- `mini-grammar.test.ts` — Grammar rules and case government

### Building

```bash
pnpm build          # build dist/
pnpm typecheck      # type check without emitting
pnpm build:data     # rebuild binary from BÍN source
```

## Acknowledgments

- **[BÍN](https://bin.arnastofnun.is/)** – Morphological database from the Árni Magnússon Institute
- **[Miðeind](https://mideind.is/)** – Greynir and foundational Icelandic NLP work
- **[tokenize-is](https://github.com/axelharri/tokenize-is)** – Icelandic tokenizer

## License

MIT for the code.

### Data License (BÍN)

The linguistic data is derived from [BÍN](https://bin.arnastofnun.is/) (Beygingarlýsing íslensks nútímamáls) © Árni Magnússon Institute for Icelandic Studies.

**By using this package, you agree to BÍN's conditions:**
- Credit the Árni Magnússon Institute in your product's UI
- Do not redistribute the raw data separately
- Do not publish inflection paradigms without permission

Full terms: [BÍN License Conditions](https://bin.arnastofnun.is/DMII/LTdata/conditions/)
