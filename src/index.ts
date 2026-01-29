import { STOPWORDS_IS, isStopword, removeStopwords } from "./stopwords.js";

export { STOPWORDS_IS, isStopword, removeStopwords };
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
export type {
  LemmatizerLike,
  LemmaWithPOS,
  WordClass,
  BigramProvider,
} from "./types.js";
export { WORD_CLASS_NAMES, WORD_CLASS_NAMES_IS } from "./types.js";
export {
  CompoundSplitter,
  createKnownLemmaSet,
  type CompoundSplit,
  type CompoundSplitterOptions,
} from "./compounds.js";
export {
  processText,
  extractIndexableLemmas,
  runBenchmark,
  type ProcessedToken,
  type ProcessOptions,
  type ProcessingStrategy,
  type ProcessingMetrics,
} from "./pipeline.js";
