# Changelog

All notable changes to this project will be documented in this file.

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
