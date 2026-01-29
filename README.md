# lemma-is

Icelandic lemmatization for JavaScript. Maps inflected word forms to base forms (lemmas) for search indexing and text processing.

## Why?

Icelandic NLP tools exist but require Python or Java. This library works in browsers and Node.js—anywhere JavaScript runs.

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

PostgreSQL has no built-in Icelandic stemmer. Use lemma-is to pre-process text, then store lemmas in a `tsvector` column with the `simple` configuration (which lowercases but doesn't stem).

### Schema

```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Store pre-computed lemmas as tsvector
  search_vector TSVECTOR
);

-- GIN index for fast full-text search
CREATE INDEX documents_search_idx ON documents USING GIN (search_vector);
```

### Indexing Documents

Lemmatize content in your application, then store as space-separated string:

```typescript
import { extractIndexableLemmas, BinaryLemmatizer } from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");

async function indexDocument(db, title: string, body: string) {
  const text = `${title} ${body}`;
  const lemmas = extractIndexableLemmas(text, lemmatizer, { removeStopwords: true });
  const lemmaString = Array.from(lemmas).join(" ");

  await db.query(
    `INSERT INTO documents (title, body, search_vector)
     VALUES ($1, $2, to_tsvector('simple', $3))`,
    [title, body, lemmaString]
  );
}
```

### Querying

Lemmatize search terms the same way:

```typescript
async function search(db, query: string) {
  // Lemmatize the search query
  const lemmas = extractIndexableLemmas(query, lemmatizer, { removeStopwords: true });
  const lemmaString = Array.from(lemmas).join(" ");

  return db.query(
    `SELECT id, title, ts_rank(search_vector, query) AS rank
     FROM documents, plainto_tsquery('simple', $1) query
     WHERE search_vector @@ query
     ORDER BY rank DESC`,
    [lemmaString]
  );
}

// User searches for "börnum" (children, dative plural)
// → lemmatized to "barn"
// → matches documents containing any form: barn, börn, börnin, barnið...
await search(db, "börnum");
```

### Why `simple`?

| Configuration | Behavior | Use case |
|--------------|----------|----------|
| `english` | Stems + removes stopwords | English text |
| `simple` | Lowercases only | Pre-lemmatized text, tags |
| Direct cast `::tsvector` | No processing | Full control |

The `simple` configuration is ideal because:
- **No stemming** – our lemmas are already normalized
- **Lowercasing** – matches our lowercase lemmas
- **Preserves all words** – no stop word removal (we handle that)

### Ranking and Weights

Weight title matches higher than body:

```typescript
const lemmaString = Array.from(lemmas).join(" ");

// Use setweight() for title vs body distinction
await db.query(
  `INSERT INTO documents (title, body, search_vector)
   VALUES ($1, $2,
     setweight(to_tsvector('simple', $3), 'A') ||
     setweight(to_tsvector('simple', $4), 'B')
   )`,
  [title, body, titleLemmas, bodyLemmas]
);
```

### Keeping Indexes Updated

Use a trigger or update on write:

```sql
-- Option 1: Application handles it (recommended)
-- Update search_vector when inserting/updating via your app

-- Option 2: Trigger (if you store raw lemma string)
ALTER TABLE documents ADD COLUMN lemmas TEXT;

CREATE FUNCTION documents_search_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.lemmas, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_search_trigger
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_search_update();
```

## Acknowledgments

- **[BÍN](https://bin.arnastofnun.is/)** – Morphological database from the Árni Magnússon Institute
- **[Miðeind](https://mideind.is/)** – Greynir and foundational Icelandic NLP work
- **[tokenize-is](https://github.com/axelharri/tokenize-is)** – Icelandic tokenizer

## License

MIT. Data derived from BÍN under the [BÍN license](https://bin.arnastofnun.is/DMII/LTdata/conditions/).
