# Changelog

All notable changes to this project will be documented in this file.

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
