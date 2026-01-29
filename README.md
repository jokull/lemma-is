# lemma-is

Icelandic lemmatization for JavaScript. Maps inflected word forms to base forms (lemmas) for search indexing and text processing.

## Why?

Existing Icelandic NLP tools don't run in browsers:

| Tool | Runtime | Standalone? | Notes |
|------|---------|-------------|-------|
| **[GreynirEngine](https://github.com/mideind/GreynirEngine)** | Python + C++ | ✓ | Gold standard. Full parser, POS tagger, 100+ MB. |
| **[Nefnir](https://github.com/lexis-project/Nefnir)** | Python | ✗ | Requires POS tags from IceNLP/IceStagger (Java, unmaintained). |
| **lemma-is** | TypeScript | ✓ | Browser/Node/edge. Bigram disambiguation, compound splitting. |

lemma-is trades parsing accuracy for portability—good enough for search, runs anywhere JavaScript runs.

## Quickstart

```bash
npm install lemma-is
```

**Get the data** (~102 MB binary):
```bash
# Option 1: Download pre-built from npm
cp node_modules/lemma-is/data-dist/lemma-is.bin ./public/

# Option 2: Build from source (requires BÍN data + Python)
# Download SHsnid.csv from https://bin.arnastofnun.is/DMII/LTdata/k-LTdata/
uv run python scripts/build-data.py && uv run python scripts/build-binary.py
```

**Browser (Web Worker)** — see [`test.html`](test.html) for a complete example:
```typescript
// Load in worker to avoid blocking main thread
const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");
self.postMessage({ lemmas: lemmatizer.lemmatize("börnin") }); // → ["barn"]
```

**Node.js endpoint**:
```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer, extractIndexableLemmas } from "lemma-is";

const buffer = readFileSync("./lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(buffer.buffer.slice(
  buffer.byteOffset, buffer.byteOffset + buffer.byteLength
));

app.post("/lemmatize", (req, res) => {
  const lemmas = extractIndexableLemmas(req.body.text, lemmatizer);
  res.json({ lemmas: [...lemmas] });
});
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
import { BinaryLemmatizer } from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");

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

### Bigram Disambiguation

Use corpus frequencies to pick the most likely lemma based on context:

```typescript
import { BinaryLemmatizer, processText } from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");

// "við erum" = "we are" → bigrams favor pronoun "ég" over preposition
const processed = processText("Við erum hér", lemmatizer);
// → disambiguated: "ég" for "við" (high confidence)

// "á morgun" = "tomorrow" → bigrams favor preposition
const processed2 = processText("Ég fer á morgun", lemmatizer);
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

For production indexing, combine tokenization, lemmatization, disambiguation, and compound splitting:

```typescript
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
  CompoundSplitter,
  createKnownLemmaSet
} from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");
const splitter = new CompoundSplitter(lemmatizer, knownLemmas);

const text = "Landbúnaðarráðherra ræddi húsnæðislánareglur";

const lemmas = extractIndexableLemmas(text, lemmatizer, {
  bigrams,
  compoundSplitter: splitter,
  removeStopwords: true,
});
// → Set { "landbúnaður", "ráðherra", "landbúnaðarráðherra",
//         "ræða", "húsnæði", "lán", "regla", ... }
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

Single binary file: `lemma-is.bin` (~102 MB)

Contains:
- 347K lemmas from BÍN
- 3.7M word form mappings
- 414K bigram frequencies

Uses ArrayBuffer with binary search for efficient memory usage.

### Building Data

```bash
# Download BÍN data from https://bin.arnastofnun.is/
# Place SHsnid.csv in data/

uv run python scripts/build-data.py      # builds lookup tables
uv run python scripts/build-binary.py    # builds lemma-is.bin
```

## Node.js Usage

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer } from "lemma-is";

const buffer = readFileSync("data-dist/lemma-is.bin");
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

## Acknowledgments

- **[BÍN](https://bin.arnastofnun.is/)** – Morphological database from the Árni Magnússon Institute
- **[Miðeind](https://mideind.is/)** – Greynir and foundational Icelandic NLP work
- **[tokenize-is](https://github.com/axelharri/tokenize-is)** – Icelandic tokenizer

## License

MIT. Data derived from BÍN under the [BÍN license](https://bin.arnastofnun.is/DMII/LTdata/conditions/).
