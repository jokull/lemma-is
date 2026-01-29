# Greynir-Inspired Improvements for lemma-is

Technical notes from analyzing GreynirEngine's disambiguation approach.

## Context

GreynirEngine uses **rule-based disambiguation** rather than statistical n-grams. Key insight: explicit phrase rules + POS constraints can outperform pure frequency-based bigram scoring for Icelandic's highly ambiguous words.

Current lemma-is approach: bigram frequency scoring in `disambiguate.ts`
Gap: no POS-aware scoring, no phrase rules, no case government awareness

---

## 1. Phrase-Based Disambiguation Rules

### Greynir's Approach

`Phrases.conf` defines explicit multi-word patterns with allowed word categories:

```
"á bilinu" fs nheþ          # á = preposition (fs), bilinu = noun neuter dative (nheþ)
"á næsta ári" fs lo hk      # á = prep, næsta = adjective, ári = noun
"vera* sá" so fn            # vera = verb (so), sá = demonstrative (fn)
"tala* við" so fs/ao        # tala = verb, við = prep or adverb
```

The `*` means "any inflected form of this lemma".

### Implementation for lemma-is

Create `phrase-rules.ts`:

```typescript
interface PhraseRule {
  pattern: string[];           // lemmas or literal forms
  posConstraints: string[][];  // allowed POS for each position
  wildcards?: boolean[];       // true = match any inflection
}

const PHRASE_RULES: PhraseRule[] = [
  // "á + noun" → á is preposition
  { pattern: ["á", null], posConstraints: [["fs"], ["no"]], wildcards: [false, true] },

  // "vera + past participle" → vera is auxiliary
  { pattern: ["vera", null], posConstraints: [["so"], ["so"]], wildcards: [true, true] },

  // "hafa + verið" → hafa is auxiliary
  { pattern: ["hafa", "vera"], posConstraints: [["so"], ["so"]], wildcards: [true, true] },
];
```

### Scoring Integration

Modify `Disambiguator.disambiguate()`:

```typescript
disambiguate(word: string, left: string | null, right: string | null): DisambiguationResult {
  const candidates = this.lemmatizer.lemmatizeWithPOS(word);

  // Phase 1: Check phrase rules (high confidence)
  const phraseMatch = this.matchPhraseRule(word, left, right, candidates);
  if (phraseMatch) {
    return { lemma: phraseMatch.lemma, confidence: 0.95, source: "phrase_rule" };
  }

  // Phase 2: Bigram frequency (existing logic)
  return this.bigramDisambiguate(word, left, right, candidates);
}
```

---

## 2. POS-Weighted Bigram Scoring

### Problem

Current scoring treats all candidates equally, but some POS combinations are syntactically impossible.

Example: "Ég á hest" (I own a horse)
- "á" candidates: `{lemma: "á", pos: "fs"}`, `{lemma: "eiga", pos: "so"}`
- Right context "hest" is accusative noun
- Preposition "á" takes accusative OR dative
- Verb "eiga" takes accusative object

Both are syntactically valid here! Need frequency data.

But in "á borðinu" (on the table):
- "borðinu" is dative
- Verb "eiga" doesn't take dative objects
- Only preposition valid → high confidence

### Implementation

```typescript
interface POSBigram {
  pos1: string;
  pos2: string;
  frequency: number;
}

// Build from IFD-tagged corpus (MÍM, IGC, etc.)
const POS_BIGRAMS: Map<string, number> = new Map([
  ["fs_no", 145000],   // preposition + noun (very common)
  ["so_no", 89000],    // verb + noun
  ["fn_so", 72000],    // pronoun + verb
  ["lo_no", 45000],    // adjective + noun
  // ...
]);

function posAwareScore(
  candidate: LemmaWithPOS,
  leftPOS: string | null,
  rightPOS: string | null
): number {
  let score = 0;

  if (leftPOS) {
    const key = `${leftPOS}_${candidate.pos}`;
    score += Math.log((POS_BIGRAMS.get(key) ?? 0) + 1);
  }

  if (rightPOS) {
    const key = `${candidate.pos}_${rightPOS}`;
    score += Math.log((POS_BIGRAMS.get(key) ?? 0) + 1);
  }

  return score;
}
```

### Data Source

Extract POS bigram frequencies from:
- MÍM corpus (Icelandic Gigaword Corpus) - tagged
- IGC (Icelandic Gigaword Corpus)
- Greynir's parsed article database

---

## 3. Case Government for Prepositions

### Greynir's Approach

`Prepositions.conf` defines which cases each preposition governs:

```
á*          þf nh        # accusative, can precede infinitive
á*          þgf          # dative
af*         þgf          # only dative
til*        ef           # only genitive
um*         þf           # only accusative
```

### Why This Matters

When "á" is followed by a dative noun, and the verb sense of "eiga" (own) only takes accusative objects, we can eliminate the verb reading.

### Implementation

```typescript
const PREPOSITION_CASES: Map<string, Set<string>> = new Map([
  ["á", new Set(["þf", "þgf"])],      // accusative or dative
  ["af", new Set(["þgf"])],            // dative only
  ["til", new Set(["ef"])],            // genitive only
  ["um", new Set(["þf"])],             // accusative only
  ["með", new Set(["þf", "þgf"])],     // accusative or dative
  ["frá", new Set(["þgf"])],           // dative only
  ["í", new Set(["þf", "þgf"])],       // accusative or dative
  ["úr", new Set(["þgf"])],            // dative only
  ["við", new Set(["þf"])],            // accusative only
  ["fyrir", new Set(["þf", "þgf"])],   // accusative or dative
]);

function validatePrepositionalPhrase(
  prep: string,
  followingWord: string,
  lemmatizer: LemmatizerLike
): boolean {
  const allowedCases = PREPOSITION_CASES.get(prep);
  if (!allowedCases) return true; // unknown prep, allow

  const forms = lemmatizer.lemmatizeWithPOS(followingWord);
  // Check if any form has a case matching the preposition's government
  return forms.some(f => {
    const wordCase = extractCase(f.pos); // þf, þgf, ef, nf
    return allowedCases.has(wordCase);
  });
}
```

### Extracting Case from POS

IFD tags encode case in position 4 for nouns:
- `nken` = noun, masculine, singular, nominative
- `nkeþ` = noun, masculine, singular, accusative
- `nkeþ` = noun, masculine, singular, dative
- `nkee` = noun, masculine, singular, genitive

```typescript
function extractCase(pos: string): string | null {
  if (!pos.startsWith("n") && !pos.startsWith("l") && !pos.startsWith("f")) {
    return null;
  }
  const caseChar = pos[3];
  const caseMap: Record<string, string> = {
    "n": "nf",  // nominative
    "o": "þf",  // accusative (older notation)
    "þ": "þgf", // dative
    "e": "ef",  // genitive
  };
  return caseMap[caseChar] ?? null;
}
```

---

## 4. Contextual Stopword Classification

### Problem

"á" should be a stopword when it's a preposition, but NOT when it's:
- Verb "eiga" (to own): "Ég á bíl" → keep "eiga"
- Noun "á" (river): "Við ána" → keep "á"

### Current Approach

`stopwords.ts` has a flat list - no context awareness.

### Proposed: `isContextualStopword()`

```typescript
interface StopwordRule {
  lemma: string;
  stopwordPOS: Set<string>;  // POS codes where this is a stopword
}

const CONTEXTUAL_STOPWORDS: StopwordRule[] = [
  { lemma: "á", stopwordPOS: new Set(["fs", "ao"]) },        // prep/adverb = stop
  { lemma: "við", stopwordPOS: new Set(["fs"]) },            // prep = stop, pronoun = keep
  { lemma: "af", stopwordPOS: new Set(["fs", "ao"]) },
  { lemma: "sem", stopwordPOS: new Set(["c", "st"]) },       // conjunction = stop
  { lemma: "það", stopwordPOS: new Set(["fp"]) },            // pronoun = stop
  { lemma: "vera", stopwordPOS: new Set(["so"]) },           // copula = stop (debatable)
  { lemma: "hafa", stopwordPOS: new Set(["so"]) },           // auxiliary = stop (debatable)
];

function isContextualStopword(
  word: string,
  disambiguatedLemma: string,
  disambiguatedPOS: string
): boolean {
  // First check simple stopwords
  if (isStopword(word)) {
    // But maybe we should KEEP it based on POS?
    const rule = CONTEXTUAL_STOPWORDS.find(r => r.lemma === disambiguatedLemma);
    if (rule && !rule.stopwordPOS.has(disambiguatedPOS)) {
      return false; // Keep this sense
    }
    return true;
  }
  return false;
}
```

---

## 5. Multi-Pass Disambiguation Pipeline

### Greynir's Pipeline

```
tokenize → correct → static_phrases → annotate → entities →
spelling → phrases_1 → phrases_2 → phrases_3 → disambiguate
```

### Proposed Pipeline for lemma-is

```typescript
interface DisambiguationPipeline {
  phases: PipelinePhase[];
}

const DEFAULT_PIPELINE: PipelinePhase[] = [
  // Phase 1: Unambiguous words (single lemma)
  { name: "unambiguous", fn: resolveUnambiguous },

  // Phase 2: Static phrases ("Bandaríkin", "Sameinuðu þjóðirnar")
  { name: "static_phrases", fn: resolveStaticPhrases },

  // Phase 3: Phrase rules (bigram patterns with POS constraints)
  { name: "phrase_rules", fn: applyPhraseRules },

  // Phase 4: Case government validation
  { name: "case_government", fn: validateCaseGovernment },

  // Phase 5: POS bigram scoring
  { name: "pos_bigrams", fn: scorePOSBigrams },

  // Phase 6: Word bigram scoring (existing)
  { name: "word_bigrams", fn: scoreWordBigrams },

  // Phase 7: Fallback to frequency
  { name: "frequency", fn: fallbackToFrequency },
];
```

Each phase can:
- Resolve ambiguity completely (return single candidate)
- Filter candidates (remove impossible ones)
- Score candidates (add to cumulative score)
- Pass through (no opinion)

---

## 6. Verb Argument Structure

### Observation

Icelandic verbs have specific argument structures:

- "eiga" (own) + accusative object
- "gefa" (give) + dative recipient + accusative object
- "hjálpa" (help) + dative object
- "sakna" (miss) + genitive object

### Implementation Sketch

```typescript
interface VerbFrame {
  lemma: string;
  arguments: ArgumentSlot[];
}

interface ArgumentSlot {
  role: "subject" | "direct_object" | "indirect_object" | "complement";
  case: string;  // nf, þf, þgf, ef
  required: boolean;
}

const VERB_FRAMES: VerbFrame[] = [
  { lemma: "eiga", arguments: [
    { role: "subject", case: "nf", required: true },
    { role: "direct_object", case: "þf", required: true }
  ]},
  { lemma: "hjálpa", arguments: [
    { role: "subject", case: "nf", required: true },
    { role: "direct_object", case: "þgf", required: true }  // dative!
  ]},
  { lemma: "sakna", arguments: [
    { role: "subject", case: "nf", required: true },
    { role: "direct_object", case: "ef", required: true }   // genitive!
  ]},
];
```

This allows disambiguation: if "á" is followed by a dative noun and we're considering the verb "eiga" (which takes accusative), we can downweight or eliminate that reading.

---

## 7. Static Multi-Word Expressions

### From Greynir's `static_phrases`

```
"Bandaríkin"                          # United States (always this meaning)
"Sameinuðu þjóðirnar"                 # United Nations
"forsætisráðherra"                    # prime minister
"alþjóðaflugvöllur"                   # international airport
```

### Implementation

```typescript
const STATIC_PHRASES: Map<string, StaticPhrase> = new Map([
  ["bandaríkin", { lemma: "Bandaríkin", pos: "no", isProperNoun: true }],
  ["sameinuðu þjóðirnar", { lemma: "Sameinuðu þjóðirnar", pos: "no", isProperNoun: true }],
  ["með öðrum orðum", { lemma: "með öðrum orðum", pos: "ao", isStopword: true }],
  ["til dæmis", { lemma: "til dæmis", pos: "ao", isStopword: true }],
  ["í raun", { lemma: "í raun", pos: "ao", isStopword: true }],
]);

function matchStaticPhrase(tokens: Token[], startIdx: number): StaticPhrase | null {
  // Try longest match first (3 words, then 2, then 1)
  for (let len = 3; len >= 1; len--) {
    const phrase = tokens.slice(startIdx, startIdx + len)
      .map(t => t.text.toLowerCase())
      .join(" ");
    const match = STATIC_PHRASES.get(phrase);
    if (match) return match;
  }
  return null;
}
```

---

## 8. Training Data Sources

### For POS Bigrams

1. **MÍM (Mörkuð íslensk málheild)** - Tagged Icelandic corpus
   - ~25M tokens with IFD tags
   - Gold standard for Icelandic POS

2. **IGC (Icelandic Gigaword Corpus)**
   - Larger but auto-tagged
   - Good for frequency estimates

3. **Greynir's parsed output**
   - Articles parsed by Greynir have full syntactic analysis
   - Can extract POS sequences from parse trees

### For Phrase Rules

1. Manual curation from common errors
2. Extract from Greynir's `Phrases.conf` (MIT licensed)
3. Mine frequent bigram/trigram patterns from corpus

### Binary Format Extension

Current `lemma-is.bin` structure:
```
[header][string_pool][lemma_index][word_index][entries][bigrams]
```

Proposed additions:
```
[header][string_pool][lemma_index][word_index][entries]
[word_bigrams][pos_bigrams][phrase_rules][preposition_cases]
```

---

## 9. Lightweight POS Tagger

### Option A: Rule-Based (Greynir-style)

Don't predict POS - instead, use BÍN lookup + context filtering.

```typescript
function getPossiblePOS(word: string): string[] {
  return lemmatizer.lemmatizeWithPOS(word).map(r => r.pos);
}

function filterByContext(
  candidates: LemmaWithPOS[],
  leftPOS: string[],
  rightPOS: string[]
): LemmaWithPOS[] {
  return candidates.filter(c => {
    // Check if this POS can follow leftPOS
    // Check if rightPOS can follow this POS
    return isValidPOSSequence(leftPOS, c.pos, rightPOS);
  });
}
```

### Option B: Statistical (HMM/CRF)

Train a lightweight HMM tagger:
- States = POS tags
- Emissions = P(word | POS) from BÍN
- Transitions = P(POS_i | POS_{i-1}) from corpus

Viterbi decoding gives best POS sequence.

**Size estimate:** ~500KB for transition matrix + emission probabilities

### Option C: Hybrid

Use rules for high-confidence cases, fall back to statistical for ambiguous.

---

## 10. Evaluation Framework

### Test Cases for "á"

```typescript
const TEST_CASES = [
  // Preposition (stopword)
  { sentence: "Bókin er á borðinu", word: "á", expectedLemma: "á", expectedPOS: "fs", isStopword: true },
  { sentence: "Hann er á Íslandi", word: "á", expectedLemma: "á", expectedPOS: "fs", isStopword: true },

  // Verb "eiga" (keep)
  { sentence: "Ég á bíl", word: "á", expectedLemma: "eiga", expectedPOS: "so", isStopword: false },
  { sentence: "Hún á hest", word: "á", expectedLemma: "eiga", expectedPOS: "so", isStopword: false },

  // Noun "á" = river (keep)
  { sentence: "Við ána", word: "ána", expectedLemma: "á", expectedPOS: "no", isStopword: false },
  { sentence: "Áin rennur", word: "Áin", expectedLemma: "á", expectedPOS: "no", isStopword: false },
];
```

### Metrics

- **Accuracy**: % correct lemma assignments
- **Stopword precision**: % of removed words that should be removed
- **Stopword recall**: % of actual stopwords that were removed
- **Confidence calibration**: Does 90% confidence mean 90% accuracy?

---

## 11. Implementation Priority

### Phase 1: Quick Wins
1. Add preposition case government rules (~50 prepositions)
2. Add static multi-word expressions (~100 phrases)
3. Extend stopword check with POS awareness

### Phase 2: Core Improvements
4. Add POS bigram frequencies to binary format
5. Implement phrase rule matching
6. Multi-pass pipeline

### Phase 3: Advanced
7. Verb argument structure validation
8. Lightweight HMM tagger
9. Confidence calibration

---

---

## 12. Compound Splitting: Greynir's Approach

### Key Insight: Greynir Doesn't Algorithmically Split

Greynir's "compound handling" is fundamentally different:

1. **BÍN lookup first** - if word exists, return it (no splitting)
2. **Only split at hyphens** - explicit markers, not guessed boundaries
3. **Proper noun protection** - `fl` flags prevent splitting names/places

**Why "Ísland" is never split:**
```
lookup("Ísland") → found in BÍN as proper noun → return immediately
                 → compound logic never runs
```

### Current lemma-is Problem

```typescript
// compounds.ts tries all positions:
for (let i = minPartLength; i <= len - minPartLength; i++) {
  const leftPart = word.slice(0, i);   // "ís"
  const rightPart = word.slice(i);      // "land"
  // Both are valid lemmas → incorrectly identified as compound!
}
```

### Proposed Fix: Lookup-First Strategy

```typescript
split(word: string): CompoundSplit {
  const normalized = word.toLowerCase();

  // NEW: Check if word exists as-is in BÍN FIRST
  const directLemmas = this.lemmatizer.lemmatize(word);

  // If we get a direct match, check if it should be protected
  if (directLemmas.length > 0) {
    const withPOS = this.lemmatizer.lemmatizeWithPOS?.(word) ?? [];

    // Protection check: proper nouns, place names, person names
    const isProtected = withPOS.some(entry =>
      PROTECTED_WORD_CLASSES.has(entry.pos) ||
      PROTECTED_LEMMAS.has(entry.lemma.toLowerCase())
    );

    if (isProtected) {
      return {
        word,
        parts: directLemmas,
        indexTerms: directLemmas,
        confidence: 1.0,
        isCompound: false,  // Explicitly NOT a compound
      };
    }

    // Even if not protected, if direct lookup succeeds with high confidence,
    // prefer the direct interpretation
    if (directLemmas.length === 1) {
      // Unambiguous direct match - don't split
      return {
        word,
        parts: directLemmas,
        indexTerms: directLemmas,
        confidence: 1.0,
        isCompound: false,
      };
    }
  }

  // Only attempt splitting if:
  // 1. No direct match, OR
  // 2. Direct match is ambiguous AND word is long enough
  // ... existing splitting logic ...
}
```

### Protected Word Classes

Based on BÍN's `fl` (word classification) field:

```typescript
const PROTECTED_WORD_CLASSES = new Set([
  // Person names
  "ism",   // Icelandic given name (mannanafn)
  "gæl",   // Pet name / nickname
  "erm",   // Foreign given name

  // Family/patronymic names
  "föð",   // Patronym (Jónsson)
  "móð",   // Matronym (Jónsdóttir)
  "ætt",   // Family name (rare in Icelandic)

  // Place names
  "lönd",  // Country names
  "göt",   // Street names
  "þor",   // Place names (þorp)
  "örn",   // Place names (örnefni)
]);

// Explicit protection list for common false positives
const PROTECTED_LEMMAS = new Set([
  "ísland",      // Iceland (not ís + land)
  "england",     // England
  "írland",      // Ireland
  "skotland",    // Scotland
  "finnland",    // Finland
  "grænland",    // Greenland
  "holland",     // Holland
  "þýskaland",   // Germany
  "frakkland",   // France
  "svíþjóð",     // Sweden
  "danmörk",     // Denmark
  "noregur",     // Norway
  "bandaríkin",  // USA
  // Add more as discovered...
]);
```

### Confidence Scoring Improvements

```typescript
interface SplitCandidate {
  leftParts: string[];
  rightParts: string[];
  score: number;
  splitType: "direct" | "linking_letter" | "hyphen";
}

function scoreSplit(left: string, right: string, word: string): number {
  let score = 0;

  // 1. Length balance (existing)
  const balance = 1 - Math.abs(left.length - right.length) / word.length;
  score += balance * 0.2;

  // 2. Part length bonus (existing)
  const avgLen = (left.length + right.length) / 2;
  score += Math.min(avgLen / 6, 0.3);

  // 3. NEW: Frequency-based scoring
  // Common compound heads/tails should score higher
  if (COMMON_COMPOUND_TAILS.has(right)) {
    score += 0.3;  // -maður, -kona, -hús, -staður, etc.
  }
  if (COMMON_COMPOUND_HEADS.has(left)) {
    score += 0.2;  // bíl-, húsa-, lands-, etc.
  }

  // 4. NEW: Penalize if split creates very common standalone words
  // "ísland" → "ís" + "land" both very common → suspicious
  if (isVeryCommonWord(left) && isVeryCommonWord(right)) {
    score -= 0.4;  // Probably a false positive
  }

  return score;
}
```

### Common Compound Patterns

From analysis of Icelandic compound structure:

```typescript
// Common compound tails (second element)
const COMMON_COMPOUND_TAILS = new Set([
  "maður",     // -man (bílstjóri→maður)
  "kona",      // -woman
  "barn",      // -child
  "hús",       // -house (sjúkrahús, bókasafn)
  "staður",    // -place
  "vegur",     // -road/way
  "dalur",     // -valley
  "fjörður",   // -fjord
  "nes",       // -peninsula
  "höfn",      // -harbor
  "vík",       // -bay
  "eyri",      // -spit
  "fell",      // -mountain
  "vatn",      // -lake/water
  "á",         // -river
  "lækur",     // -stream
  "skip",      // -ship
  "bátur",     // -boat
  "vél",       // -machine
  "tæki",      // -device
  "kerfi",     // -system
  "stofnun",   // -institution
  "félag",     // -association
  "ráð",       // -council
  "nefnd",     // -committee
  "þing",      // -parliament/assembly
  "ráðherra",  // -minister
  "stjóri",    // -manager/driver
  "vörður",    // -guard
  "starfsmaður", // -employee
]);

// Common compound heads (first element, often in genitive)
const COMMON_COMPOUND_HEADS = new Set([
  "bíla",      // car- (genitive plural)
  "húsa",      // house-
  "skipa",     // ship-
  "manna",     // man/people-
  "lands",     // land/country-
  "ríkis",     // state-
  "borgar",    // city-
  "bæjar",     // town-
  "sjúkra",    // sick- (genitive)
  "barna",     // child- (genitive)
  "alþjóða",   // international-
  "inn",       // inner-
  "út",        // outer-
  "fram",      // forward-
  "aftur",     // back-
]);
```

### Hyphen-Only Mode (Greynir-style)

For maximum precision, offer a conservative mode:

```typescript
interface CompoundSplitterOptions {
  mode: "aggressive" | "balanced" | "conservative";
  // aggressive: try all positions (current behavior)
  // balanced: lookup-first + scoring (proposed default)
  // conservative: only split at hyphens (Greynir-style)
}

function splitConservative(word: string): CompoundSplit {
  // Only split at explicit hyphens
  if (!word.includes("-")) {
    return { word, parts: [word], isCompound: false, confidence: 1 };
  }

  const parts = word.split("-").filter(Boolean);
  const lemmatizedParts = parts.flatMap(p => this.lemmatizer.lemmatize(p));

  return {
    word,
    parts: lemmatizedParts,
    indexTerms: [...lemmatizedParts, word.replace(/-/g, "")],
    confidence: 0.95,
    isCompound: true,
  };
}
```

### Data Requirements

To implement lookup-first properly, need:

1. **POS information in binary format** - already have `lemmatizeWithPOS()`
2. **Word class (`fl`) field from BÍN** - need to add to binary format
3. **Protected lemma list** - curate manually, ~200-500 entries
4. **Compound frequency data** - which splits are attested in corpus

### Binary Format Extension

```
Current: [header][strings][lemmas][words][entries][bigrams]

Add: [word_class_flags] - packed fl codes for each lemma
     - 1 byte per lemma (256 possible fl values)
     - ~350KB additional for 350K lemmas
```

### Evaluation: False Positive Detection

```typescript
const FALSE_POSITIVE_TESTS = [
  // Place names that look like compounds
  { word: "Ísland", shouldSplit: false },
  { word: "England", shouldSplit: false },
  { word: "Grænland", shouldSplit: false },
  { word: "Finnland", shouldSplit: false },

  // Person names
  { word: "Sigurður", shouldSplit: false },
  { word: "Guðmundur", shouldSplit: false },

  // True compounds (should split)
  { word: "bílstjóri", shouldSplit: true, parts: ["bíll", "stjóri"] },
  { word: "sjúkrahús", shouldSplit: true, parts: ["sjúkur", "hús"] },
  { word: "landbúnaður", shouldSplit: true, parts: ["land", "búnaður"] },
];
```

---

## Resources

- Greynir source: https://github.com/mideind/GreynirEngine (MIT)
- `Phrases.conf`: `/src/reynir/config/Phrases.conf`
- `Prepositions.conf`: `/src/reynir/config/Prepositions.conf`
- IFD tagset: https://bin.arnastofnun.is/DMII/LTdata/tagset/
- MÍM corpus: https://mim.hi.is/
- BÍN database: https://bin.arnastofnun.is/

---

## Notes

GreynirEngine is MIT licensed - can directly use/adapt:
- Phrase rules from `Phrases.conf`
- Preposition cases from `Prepositions.conf`
- IFD tag mappings from `ifdtagger.py`

Key difference in philosophy:
- Greynir: Full parsing, high accuracy, heavy computation
- lemma-is: Lightweight, offline-first, good-enough disambiguation

Goal: Cherry-pick Greynir's disambiguation rules without the full parser.
