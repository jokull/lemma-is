# lemma-is

Icelandic lemmatization for JavaScript. Maps inflected word forms to base forms (lemmas) for search indexing and text processing.

## Why?

Icelandic NLP tools exist but require Python or Java. This library works in browsers, Node.js, and edge runtimes like Cloudflare Workers—anywhere JavaScript runs.

## The Problem

Icelandic is highly inflected. A single word appears in dozens of forms:

| Base word | Forms in text |
|-----------|---------------|
| barn (child) | börnin, barnið, barna, börnum... |
| fara (go) | fóru, fer, fór, förum, farið... |

If you index "Börnin fóru í bíó" by splitting on whitespace, a search for "barn" finds nothing—the word "barn" never appears, only "börnin".

## Solution

```typescript
import { BinaryLemmatizer } from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");
lemmatizer.lemmatize("börnin");  // → ["barn"]
lemmatizer.lemmatize("fóru");    // → ["fara"]
```

Now searches for "barn" or "fara" match.

## Usage

### Browser / Edge Workers

```typescript
import { BinaryLemmatizer } from "lemma-is";

const lemmatizer = await BinaryLemmatizer.load("/data/lemma-is.bin");

lemmatizer.lemmatize("hestinum");           // → ["hestur"]
lemmatizer.lemmatize("á", { wordClass: "so" }); // → ["eiga"] (verbs only)
lemmatizer.lemmatizeWithPOS("á");           // → [{ lemma: "á", pos: "fs" }, ...]
lemmatizer.bigramFreq("að", "vera");        // → 453358
```

### Node.js

```typescript
import { readFileSync } from "fs";
import { BinaryLemmatizer } from "lemma-is";

const buffer = readFileSync("data/lemma-is.bin");
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
);
```

## Data

Single binary file: `lemma-is.bin` (~102 MB)

Contains:
- 347K lemmas from BÍN
- 3.7M word form mappings
- 414K bigram frequencies

Uses ArrayBuffer with binary search—fits in 128MB memory limit for edge workers.

Data source: [BÍN](https://bin.arnastofnun.is/) (Beygingarlýsing íslensks nútímamáls) from the Árni Magnússon Institute.

## Word Classes

Filter by part of speech:

| Code | Icelandic | English |
|------|-----------|---------|
| `no` | nafnorð | noun |
| `so` | sagnorð | verb |
| `lo` | lýsingarorð | adjective |
| `ao` | atviksorð | adverb |
| `fs` | forsetning | preposition |
| `fn` | fornafn | pronoun |

## Acknowledgments

- **[BÍN](https://bin.arnastofnun.is/)** – Morphological database from the Árni Magnússon Institute
- **[Miðeind](https://mideind.is/)** – Greynir and foundational Icelandic NLP work
- **[tokenize-is](https://github.com/axelharri/tokenize-is)** – Icelandic tokenizer

## License

MIT. Data derived from BÍN under the [BÍN license](https://bin.arnastofnun.is/DMII/LTdata/conditions/).
