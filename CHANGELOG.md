# Changelog

All notable changes to this project will be documented in this file.

## [0.12.0] - 2026-08-10

### Added

- **Unknown-form inflectional fallback in `lemmatize()`**: missing word forms now strip common Icelandic endings and re-look-up the stem, returning only real dictionary lemmas — `skógs` → `skógur`, `kýrnanna` → `kýr`, `vinsins` → `vinur`, `óxum`/`óxu` → `vaxa`, and core-model gaps like `brandinn` → `brandur`. Closes #6 and the core gaps in #10.
- **Full model ships in the npm package** (`data-dist/lemma-is.bin` plus the `lookup.tsv.gz`/`lemmas.txt.gz` sidecar). The full binary resolves every form the core leaves unchanged. Closes #10.
- **`isKnown` on `LemmatizerLike`**; `CompoundSplitter` now requires compound parts to be raw dictionary word forms, so suffix-stripped pseudo-words (e.g. `slán` in `húsnæðislán`) can't hijack a split.
- **Known compound headwords decompose** (`CompoundSplitter`): inflected forms of compounds the model knows as headwords now split via the headword's own decomposition (cached per headword), so the full model indexes `húsnæðisláninu` → `húsnæði` + `lán`, `kreditkortsins` → `kredit` + `kort`, `skólamatnum` → `skóla` + `matur` — previously `isCompound: false` for every headword the full model knew. Ordinary known words (hestinum, stráknum) stay protected. Closes #11.
- **Occurrence-data-guided compound curation**: `scripts/compound-review.mts` runs the real splitter over every corpus lemma with unigram-frequency evidence and emits ranked blacklist (splitting-but-lexicalized) and whitelist (not-splitting-but-compound) candidates for manual review. First curated pass applied: derivational-suffix rule rejects splits whose right part is an agent-noun/adverb/diminutive/participle suffix (`-ari`, `-leg/-lega`, `-lingur`, `-andi`) — e.g. `kennari` no longer splits to `kenna + ari`, `ágætlega` not to `ágætur + lega`; ~30 names and junk derivations (forseti, margrét, guðmundur, mistök, ...) added to the never-split list; and transparent compounds that fail algorithmic splitting (a part is not a dictionary word form) are force-split with explicit part lemmas — `samgöngur` → `ganga`, `handtaka` → `taka`, `fíkniefni` → `efni`, `samgöngumál` → `mál`. Benchmark overindexing metrics (compoundsFound, uniqueLemmas, ambiguityRate) dropped across all corpora.

### Changed

- **`lemmatize()` returns `[]` for non-word tokens** (whitespace, punctuation); digit tokens still pass through. Closes #5.
- **Tokenizer hygiene in `extractIndexableLemmas`/`buildSearchQuery`**: standalone `%` never indexed; hyphenated/colon numerics (dates, times), URLs, emails, domains and other non-word tokens behave like plain numbers — dropped by default, indexable with `includeNumbers: true`; hyphen-joined repeated inflected forms decompose like their space-separated equivalent (`börnin-börnin` → `barn`). Closes #9.
- **Stopword filtering is robust to lemmatization**: `ekki` and `var` added to `STOPWORDS_IS`; in simple mode the surface token's own stopword status now drops lemmatization escapes (`er`→`vera`, `sem`→`semja`, `á`→`eiga`, `hún`→`húnn`). A stopwords-only sentence indexes nothing. Closes #8.
- **Data rebuild drops proper-noun-only lemma readings** that collide with common word forms (`Skólinn` the school name no longer makes `skólinn` its own lemma; `skólann`/`skólanum`/`skólans` → `skóli`). Lemmas with a real common source (`á` the river, `hestur`) are preserved. Closes #3.

## [0.11.0] - 2026-03-19

### Added

- **Subject-verb-object disambiguation rule**: Resolves verb/preposition ambiguity for "á" when preceded by a nominative noun or proper name. Previously only pronoun subjects (ég, hann, hún) triggered the verb "eiga" reading; now noun subjects work too: "Barnið á leikfangið" → eiga, "Jón á þrjá hesta" → eiga, "Konráð á buxurnar" → eiga.
- **`inferCaseFromSuffix()`**: Infers grammatical case from Icelandic definite article suffixes (-inn, -inu, -innar, etc.), enabling case-aware disambiguation even with the compact core binary that lacks morph case data.
- **`applySubjectVerbRule()`**: New grammar rule export for direct use.
- Test suite: `tests/subject-verb-disambiguation.test.ts` (17 tests).

### Changed

- Grammar rule pipeline now runs SVO rule before preposition+case rule.
- Adjectives and numerals recognized as noun phrase heads in SVO rule, handling "Pabbi á stóran bát" and "Jón á þrjá hesta".
- `applyGrammarRules()` accepts optional `nextWord` raw string for suffix-based case inference fallback.
- `GrammarLemmatizerLike` interface extended with optional `lemmatizeWithMorph`.

## [0.10.0] - 2026-02-02

### Added

- **Search result highlighting**: New `highlight(query, document, lemmatizer)` function finds and marks query matches across inflections
  - Returns `TextSegment[]` with `text` and `highlight` boolean for custom rendering
  - Matches work across word forms: searching "hestur" highlights "Hestarnir"
- **Snippet extraction**: New `extractSnippets(query, document, lemmatizer, options)` for long documents
  - Extracts best matching fragments ranked by match density
  - Options: `snippetWords` (default 15), `maxSnippets` (default 3), `ellipsis` (default "…")
  - Respects sentence boundaries when possible
  - Returns `Snippet[]` with `text`, `segments`, `score`, and character offsets
- `ProcessedToken.span` now includes character offsets when `includeOffsets: true`
- New exports: `highlight`, `extractSnippets`, `TextSegment`, `HighlightResult`, `HighlightOptions`, `Snippet`, `SnippetOptions`, `SnippetResult`, `TokenSpan`

### Changed

- Requires `tokenize-is@0.2.0` which adds offset tracking through the tokenization pipeline

## [0.9.0] - 2026-02-01

### Added

- **Suffix stripping for foreign names**: Foreign names with Icelandic case endings are now indexed with their base form. Searching for "Simon" finds documents containing "Simons" (genitive), "Obama" finds "Obamas", etc.
- New `stripUnknownSuffixes` option in `ProcessOptions` (default: `true`)
- IGC-2024 HuggingFace corpus test harness for coverage testing

### Changed

- Extended suffix list with genitive `-s` and other common Icelandic case endings
- Suffix stripping only applies to words not found in BIN (prevents overindexing)

## [0.8.0] - 2026-02-01

### Added

- **Hyphen splitting for unknown words**: Unknown hyphenated tokens like "COVID-sýking" now index both parts separately, improving recall for loanword compounds
- **Search UX test suite**: 30+ tests validating real-world Icelandic search scenarios (inflection matching, compound search, verb conjugation)
- README "Background" section explaining the Icelandic search ecosystem gap

### Fixed

- Search for partial terms in hyphenated words (e.g., "COVID" now finds "COVID-sýking")

## [0.7.0] - 2026-02-01

### Added

- **Token normalization for non-word types**: Pipeline now indexes rich token types from tokenize-is:
  - Phone numbers: `+3545551234` (with country code prefix)
  - Emails: lowercase normalized
  - URLs/domains: preserved or lowercased
  - Dates: ISO format `2024-03-15`
  - Times: `HH:MM` or `HH:MM:SS`
  - Timestamps: ISO format
  - SSN (kennitala): `010130-2989` (with dash)
  - Amounts: `100 USD` (value + currency)
  - Measurements: `15 m` (value + unit)
  - Percentages: `25%` (with suffix)
  - Hashtags: `#iceland` (keeps prefix, lowercased)
  - Usernames: `@jokull` (keeps prefix, lowercased)
- `normalizeToken` export for custom token handling
- Type indicators preserved to prevent over-indexing (searching "iceland" won't match "#iceland")

## [0.6.0] - 2026-01-31

### Added

- `buildSearchQuery` helper to normalize user queries into boolean groups
- `SearchQueryOptions` and `SearchQueryResult` exports for query building
- README guidance for backend-agnostic query normalization
- Test coverage for query building scenarios

## [0.5.0] - 2026-01-31

### Added

- Bloom filter known-lemma lookup for compound splitting to reduce memory footprint
- IFD/IGC gold-eval utilities and GreynirEngine comparison scripts (local benchmarks)

### Changed

- Core-only unknown-word suffix fallback for improved recall on rare inflections
- Morph lookup caching in disambiguator to reduce repeated morph queries
- README positioning updated for search indexing vs full parsing tradeoffs

## [0.4.0] - 2026-01-30

### Added

- Core binary build (~9–11 MB) for browser/edge use: `data-dist/lemma-is.core.bin`
- Core sweep/eval tools to quantify size vs recall tradeoffs (`scripts/benchmark/core-sweep.ts`, `scripts/benchmark/core-eval.ts`)

### Changed

- Core binary is now the default in docs and demo; full binary remains available
- `build:core` now generates the ~20 MB memory target core pack (top 350k word forms)
- Pipeline now caches lemmas per pass to avoid repeated lookups
- Bench scripts accept `LEMMA_IS_DATA` to compare core/full binaries

### Removed

- `usePhraseRules` option (no-op placeholder)

## [0.3.0] - 2025-01-30

### Added

- **Noun-after-preposition disambiguation rule**: Words following prepositions are now correctly identified as nouns when their grammatical case matches what the preposition governs
  - Example: "til fundar" now correctly resolves "fundar" as noun "fundur" (genitive), not verb "funda"
  - Rule only applies when the previous word is unambiguously a preposition, avoiding false positives like "við fórum" (pronoun + verb)
- New exports: `applyNounAfterPrepositionRule`, `GrammarLemmatizerLike`
- Comprehensive test coverage for the new disambiguation rule

### Changed

- **Redesigned test.html demo** with visual decision flow:
  - Summary metrics showing indexed terms, compound expansions, and ejections
  - Four-tab interface: Word Flow, Index Terms, Ejections, Expansions
  - Visual indicators for disambiguation rules (grammar, bigram, fallback)
  - Color-coded badges and strikethrough for rejected candidates
- `applyGrammarRules()` now accepts an optional lemmatizer parameter for noun-after-preposition lookups

### Fixed

- "til fundar" and similar preposition + genitive noun patterns now disambiguate correctly

## [0.2.3] - 2025-01-29

### Fixed

- README examples for Node.js usage

## [0.2.0] - 2025-01-29

### Added

- Morphological features (case, gender, number) in binary format v2
- Grammar-based disambiguation using case government rules
- `lemmatizeWithMorph()` method for accessing morphological information

### Changed

- Simplified lemmatizer by removing bigram/unigram frequency data from core lookup
- Binary format upgraded to v2 with morphological feature encoding

## [0.1.0] - 2025-01-28

### Added

- Initial release
- Binary lemmatizer with BÍN dictionary data
- Compound word splitting
- Stopword filtering (contextual and static)
- Bigram-based disambiguation
- Browser and Node.js support
