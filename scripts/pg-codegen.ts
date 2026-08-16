import { writeFileSync } from "fs";
import { join } from "path";
import { STOPWORDS_IS, CONTEXTUAL_STOPWORDS } from "../src/stopwords.js";
import { DISAMBIGUATION_RULES } from "../src/disambiguation-rules.js";
import { STATIC_PHRASES } from "../src/phrases.js";
import { PREPOSITION_CASES, NOMINATIVE_PRONOUNS } from "../src/mini-grammar.js";
import {
  PROTECTED_LEMMAS,
  COMMON_COMPOUND_TAILS,
  COMMON_STANDALONE,
} from "../src/compounds.js";

const outPath = join(import.meta.dirname, "..", "postgres", "icelandic_fts_data.h");

const POS = ["no", "so", "lo", "ao", "fs", "fn", "st", "to", "gr", "uh"] as const;
type Pos = (typeof POS)[number];

const posMask = (pos: Pos): number => {
  const idx = POS.indexOf(pos);
  return idx >= 0 ? 1 << idx : 0;
};

const posMaskSet = (set: Set<string>): number => {
  let mask = 0;
  for (const pos of set) {
    if (POS.includes(pos as Pos)) {
      mask |= posMask(pos as Pos);
    }
  }
  return mask;
};

const ctxToEnum = (ctx: string): string => {
  switch (ctx) {
    case "before_noun":
      return "CTX_BEFORE_NOUN";
    case "before_verb":
      return "CTX_BEFORE_VERB";
    case "after_pronoun":
      return "CTX_AFTER_PRONOUN";
    case "sentence_start":
      return "CTX_SENTENCE_START";
    default:
      return "CTX_ANY";
  }
};

const caseMask = (cases: Set<string>): number => {
  let mask = 0;
  for (const c of cases) {
    if (c === "nf") mask |= 1 << 0;
    if (c === "þf") mask |= 1 << 1;
    if (c === "þgf") mask |= 1 << 2;
    if (c === "ef") mask |= 1 << 3;
  }
  return mask;
};

const escape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const stopwords = Array.from(STOPWORDS_IS).sort();
const contextual = Array.from(CONTEXTUAL_STOPWORDS.entries()).sort((a, b) =>
  a[0].localeCompare(b[0])
);
const rules = DISAMBIGUATION_RULES;
const phrases = Array.from(STATIC_PHRASES.entries()).sort((a, b) =>
  a[0].localeCompare(b[0])
);
const preps = Array.from(PREPOSITION_CASES.entries()).sort((a, b) =>
  a[0].localeCompare(b[0])
);
const pronouns = Array.from(NOMINATIVE_PRONOUNS).sort();
const protectedLemmas = Array.from(PROTECTED_LEMMAS).sort();
const compoundTails = Array.from(COMMON_COMPOUND_TAILS).sort();
const commonStandalone = Array.from(COMMON_STANDALONE).sort();

const out = `#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum IcelandicPos {
  POS_NO = 0,
  POS_SO = 1,
  POS_LO = 2,
  POS_AO = 3,
  POS_FS = 4,
  POS_FN = 5,
  POS_ST = 6,
  POS_TO = 7,
  POS_GR = 8,
  POS_UH = 9
} IcelandicPos;

typedef enum IcelandicContext {
  CTX_ANY = 0,
  CTX_BEFORE_NOUN = 1,
  CTX_BEFORE_VERB = 2,
  CTX_AFTER_PRONOUN = 3,
  CTX_SENTENCE_START = 4
} IcelandicContext;

typedef struct StopwordEntry {
  const char *word;
} StopwordEntry;

typedef struct ContextualStopwordEntry {
  const char *word;
  uint16_t pos_mask;
} ContextualStopwordEntry;

typedef struct DisambiguationRuleEntry {
  const char *word;
  IcelandicPos prefer;
  IcelandicPos over;
  IcelandicContext context;
} DisambiguationRuleEntry;

typedef struct PhraseEntry {
  const char *phrase;
  const char *lemma;
  bool is_stopword;
  IcelandicPos pos;
} PhraseEntry;

typedef struct PrepositionCaseEntry {
  const char *prep;
  uint8_t case_mask;
} PrepositionCaseEntry;

static const StopwordEntry ICELANDIC_STOPWORDS[] = {
${stopwords.map((w) => `  {"${escape(w)}"}`).join(",\n")}
};

static const size_t ICELANDIC_STOPWORDS_COUNT = ${stopwords.length};

static const ContextualStopwordEntry ICELANDIC_CONTEXTUAL_STOPWORDS[] = {
${contextual
  .map(
    ([lemma, set]) =>
      `  {"${escape(lemma)}", ${posMaskSet(set as Set<string>)} }`
  )
  .join(",\n")}
};

static const size_t ICELANDIC_CONTEXTUAL_STOPWORDS_COUNT = ${
  contextual.length
};

static const DisambiguationRuleEntry ICELANDIC_DISAMBIGUATION_RULES[] = {
${rules
  .map(
    (rule) =>
      `  {"${escape(rule.word)}", POS_${rule.prefer.toUpperCase()}, POS_${rule.over.toUpperCase()}, ${ctxToEnum(
        rule.context
      )}}`
  )
  .join(",\n")}
};

static const size_t ICELANDIC_DISAMBIGUATION_RULES_COUNT = ${rules.length};

static const PhraseEntry ICELANDIC_PHRASES[] = {
${phrases
  .map(([key, value]) => {
    const pos =
      value.pos && value.pos !== "entity"
        ? `POS_${value.pos.toUpperCase()}`
        : "POS_NO";
    return `  {"${escape(key)}", "${escape(value.lemma)}", ${
      value.isStopword ? "true" : "false"
    }, ${pos}}`;
  })
  .join(",\n")}
};

static const size_t ICELANDIC_PHRASES_COUNT = ${phrases.length};

static const PrepositionCaseEntry ICELANDIC_PREP_CASES[] = {
${preps
  .map(
    ([prep, cases]) =>
      `  {"${escape(prep)}", ${caseMask(cases as Set<string>)} }`
  )
  .join(",\n")}
};

static const size_t ICELANDIC_PREP_CASES_COUNT = ${preps.length};

static const char *ICELANDIC_NOMINATIVE_PRONOUNS[] = {
${pronouns.map((p) => `  "${escape(p)}"`).join(",\n")}
};

static const size_t ICELANDIC_NOMINATIVE_PRONOUNS_COUNT = ${pronouns.length};

static const char *ICELANDIC_PROTECTED_LEMMAS[] = {
${protectedLemmas.map((p) => `  "${escape(p)}"`).join(",\n")}
};

static const size_t ICELANDIC_PROTECTED_LEMMAS_COUNT = ${
  protectedLemmas.length
};

static const char *ICELANDIC_COMMON_COMPOUND_TAILS[] = {
${compoundTails.map((p) => `  "${escape(p)}"`).join(",\n")}
};

static const size_t ICELANDIC_COMMON_COMPOUND_TAILS_COUNT = ${
  compoundTails.length
};

static const char *ICELANDIC_COMMON_STANDALONE[] = {
${commonStandalone.map((p) => `  "${escape(p)}"`).join(",\n")}
};

static const size_t ICELANDIC_COMMON_STANDALONE_COUNT = ${
  commonStandalone.length
};
`;

writeFileSync(outPath, out, "utf8");
console.log(`Wrote ${outPath}`);
