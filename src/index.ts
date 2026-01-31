import {
  STOPWORDS_IS,
  isStopword,
  removeStopwords,
  isContextualStopword,
  CONTEXTUAL_STOPWORDS,
} from "./stopwords.js";

export {
  STOPWORDS_IS,
  isStopword,
  removeStopwords,
  isContextualStopword,
  CONTEXTUAL_STOPWORDS,
};
export {
  BinaryLemmatizer,
  type BinaryLemmatizerOptions,
  type BinaryLemmatizeOptions,
} from "./binary-lemmatizer.js";
export {
  Disambiguator,
  extractDisambiguatedLemmas,
  type DisambiguatorOptions,
  type DisambiguatedToken,
} from "./disambiguate.js";
export {
  DISAMBIGUATION_RULES,
  getRulesForWord,
  hasDisambiguationRules,
  type DisambiguationRule,
} from "./disambiguation-rules.js";
export {
  PREPOSITION_CASES,
  NOMINATIVE_PRONOUNS,
  applyGrammarRules,
  applyPrepositionRule,
  applyPronounVerbRule,
  applyNounAfterPrepositionRule,
  canGovernCase,
  isKnownPreposition,
  getGovernedCases,
  type GrammarRuleMatch,
  type GrammarLemmatizerLike,
} from "./mini-grammar.js";
export type {
  LemmatizerLike,
  LemmaWithPOS,
  LemmaWithMorph,
  WordClass,
  BigramProvider,
  MorphFeatures,
  GrammaticalCase,
  GrammaticalGender,
  GrammaticalNumber,
} from "./types.js";
export {
  WORD_CLASS_NAMES,
  WORD_CLASS_NAMES_IS,
  CASE_NAMES,
  GENDER_NAMES,
  NUMBER_NAMES,
} from "./types.js";
export {
  CompoundSplitter,
  createKnownLemmaSet,
  createKnownLemmaFilter,
  PROTECTED_LEMMAS,
  type CompoundSplit,
  type CompoundSplitterOptions,
  type CompoundSplitMode,
  type KnownLemmaLookup,
  type KnownLemmaFilterOptions,
} from "./compounds.js";
export {
  STATIC_PHRASES,
  matchPhrase,
  isKnownPhrase,
  getPhraseInfo,
  type StaticPhrase,
} from "./phrases.js";
export {
  processText,
  extractIndexableLemmas,
  buildSearchQuery,
  runBenchmark,
  type ProcessedToken,
  type ProcessOptions,
  type SearchQueryOptions,
  type SearchQueryResult,
  type ProcessingStrategy,
  type ProcessingMetrics,
} from "./pipeline.js";
