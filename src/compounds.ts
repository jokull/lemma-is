/**
 * Compound word splitting for Icelandic.
 *
 * Icelandic compounds are written as single words:
 * - "bílstjóri" = "bíl" (car) + "stjóri" (driver)
 * - "sjúkrahús" = "sjúkra" (sick-GEN) + "hús" (house)
 *
 * Strategy:
 * 1. Try splitting at each position
 * 2. Check if both parts are known words
 * 3. Handle common compound linking letters (s, u, a)
 * 4. Score by part lengths (prefer balanced splits)
 */

import type { LemmaWithMorph, LemmatizerLike } from "./types.js";
import { BloomFilter, type BloomFilterOptions } from "./bloom.js";

/**
 * Protected lemmas that should NEVER be split as compounds.
 * Mostly place names that happen to end in common word parts.
 */
export const PROTECTED_LEMMAS = new Set([
  // Countries ending in -land
  "ísland",
  "england",
  "írland",
  "skotland",
  "finnland",
  "grænland",
  "holland",
  "þýskaland",
  "frakkland",
  "pólland",
  "tékkland",
  "svissland",
  "rússland",
  "eistland",
  "lettland",
  "litháen",
  // Other countries/regions
  "danmörk",
  "noregur",
  "svíþjóð",
  "bandaríkin",
  "spánn",
  "portúgal",
  "ítalía",
  "grikkland",
  // Icelandic place names (from BÍN)
  "þingvellir",
  "akureyri",
  "ísafjörður",
  "reykjavík",
  "keflavík",
  "hafnarfjörður",
  "kópavogur",
  "seltjarnarnes",
  "garðabær",
  "mosfellsbær",
  "vestmannaeyjar",
  "húsavík",
  "sauðárkrókur",
  "siglufjörður",
  "ólafsfjörður",
  "dalvík",
  "egilsstaðir",
  "neskaupstaður",
  "seyðisfjörður",
  "eskifjörður",
  "reyðarfjörður",
  "fáskrúðsfjörður",
  "stöðvarfjörður",
  "djúpivogur",
  "höfn",
  "vík",
  "selfoss",
  "hveragerði",
  "þorlákshöfn",
  "grindavík",
  "sandgerði",
  "borgarnes",
  "stykkishólmur",
  "grundarfjörður",
  "ólafsvík",
  "búðardalur",
  "patreksfjörður",
  "flateyri",
  "suðureyri",
  "bolungarvík",
  "hólmavík",
  "hvammstangi",
  "blönduós",
  "skagaströnd",
  "varmahlíð",
  // Literary/historical places
  "hlíðarendi",
  "bergþórshvol",
  // Company names
  "íslandsbanki",
  "landsbankinn",
  "arionbanki",
  // Institutions
  "alþingi",
  // Names / foreign places (junk splits, from scripts/compound-review.mts)
  "margrét",
  "sæmundur",
  "vífill",
  "halldór",
  "melkorka",
  "elliði",
  "kanslari",
  "flórída",
  "kanada",
  "london",
  "króatía",
  "afganistan",
  "tindastóll",
  "látrabjarg",
  "álftanes",
  "kringlumýrarbraut",
  "guðmundur",
  "kristjana",
  // Ordinary words with junk splits (derivations or prefix+root)
  "forseti",
  "heimild",
  "nauðsyn",
  "samstarf",
  "frumvarp",
  "mistök",
  "alfarið",
  "leikinn",
  "austan",
  "suðaustur",
  "þrefalt",
  "fjölbreytni",
  "skýring",
  "riðill",
  "ofurölvi",
  "organisti",
  "maríjúana",
  "einstaklingur",
  "sjúklingur",
  "fjölyrða",
  "umtalsvert",
  "undrandi",
  "skrápflúra",
  "veiking",
  "kolbeinn",
  "merking",
  "endurspegla",
  // Lexicalized compounds/derivations whose parts are search noise
  // (lögregla ≠ lög + regla, heilbrigði ≠ heill + brigði)
  "lögregla",
  "heilbrigði",
  "kynslóð", // generation: neither kyn + slóð nor kyn + lóð helps search
  // Short simplex words whose headword happens to split into two dictionary
  // forms (lít + illur, fló + kinn, fors + endi); corpus-frequent, so
  // curated rather than a length rule that would also stop tónlist/fjármál
  "lítill",
  "flókinn",
  "þekking",
  "forsenda",
  "kostnaður",
  "tilfelli",
  "enginn",
  "sérstakur",
  "heimill", // heimilt ≠ heim + illur
  "höfundur",
  "pólitískur",
  "tiltekinn",
]);

export interface CompoundSplit {
  /** Original word */
  word: string;
  /** Constituent parts (lemmatized) - all variants for indexing */
  parts: string[];
  /** All index terms: parts + original word */
  indexTerms: string[];
  /** Split confidence (0-1) */
  confidence: number;
  /** Is this a compound? */
  isCompound: boolean;
}

/**
 * Splitting mode for compound words.
 *
 * - "aggressive": Try to split all words, even known BÍN entries
 * - "balanced": Split unknown words; split known words only if high confidence
 * - "conservative": Only split at hyphens or very high confidence cases
 */
export type CompoundSplitMode = "aggressive" | "balanced" | "conservative";

export interface CompoundSplitterOptions {
  /**
   * Minimum part length.
   * Default: 3. Set to 2 for more aggressive splitting (e.g., "ís" in "ísland").
   */
  minPartLength?: number;
  /** Try removing linking letters (s, u, a) */
  tryLinkingLetters?: boolean;
  /**
   * Splitting mode.
   * Default: "balanced"
   */
  mode?: CompoundSplitMode;
}

/**
 * Common compound tail words in Icelandic.
 * These are often the second part of compounds and boost split confidence.
 */
const COMMON_COMPOUND_TAILS = new Set([
  // People/roles
  "maður",
  "kona",
  "stjóri",
  "ráðherra",
  "forseti",
  "formaður",
  "fulltrúi",
  "starfsmaður",
  // Places
  "hús",
  "staður",
  "vegur",
  "borg",
  "bær",
  "dalur",
  "fjörður",
  // Organizations
  "félag",
  "banki",
  "sjóður",
  "stofnun",
  "ráð",
  // Things/concepts
  "rannsókn",
  "greiðsla",
  "mál",
  "kerfi",
  "verk",
  "þjónusta",
  "rekstur",
  "viðskipti",
  "verð",
  "kostnaður",
]);

/**
 * Very common standalone words that should rarely be compound parts.
 * Penalize splits where BOTH parts are common standalone words.
 */
const COMMON_STANDALONE = new Set([
  "vera",
  "hafa",
  "gera",
  "fara",
  "koma",
  "segja",
  "vilja",
  "mega",
  "þurfa",
  "verða",
  "geta",
  "sjá",
  "taka",
  "eiga",
  "láta",
  "halda",
  "leyfa",
  "búa",
]);

/**
 * Common compound linking patterns in Icelandic.
 * These letters often join compound parts:
 * - "s" (genitive): húss + eigandi -> "húseigandi"
 * - "u" (genitive/linking): vatnu + fall -> "vatnufall" (rare)
 * - "a" (genitive): daga + blað -> "dagablað"
 */
const LINKING_PATTERNS = ["s", "u", "a"];

/**
 * Derivational suffixes that look like compound parts but never are.
 * Splits whose right part is one of these are derivations, not compounds:
 * agent nouns in -ari (kennari → kenna + ari), adverbs/adjectives in
 * -lega/-leg (ágætlega → ágætur + lega), diminutives in -lingur
 * (einstaklingur → einstak + lingur). Indexing the suffix as a part is pure
 * noise. Found via scripts/compound-review.mts with corpus evidence.
 */
export const DERIVATIONAL_SUFFIX_LEMMAS = new Set([
  "ari",
  "ar",
  "leg",
  "lega",
  "lingur",
  "ling",
  "andi", // present participles / agent nouns (villandi → vil + andi)
  // Surface suffixes checked before lemmatization (atvinnuleysi → leysir)
  "leysi",
  "semi",
  "skapur",
]);

/**
 * Rare noun homographs of frequent inflected forms that corpus-frequency
 * rank cannot separate from the common noun (the rare lemma's own surface
 * form is a very common form of the other): "laga" is lög, not lagi;
 * "mála" is mál, not máli. Never indexed as a compound part.
 */
export const NEVER_PART_LEMMAS = new Set([
  "lagi",
  "máli",
  "ríkir",
  "verki",
  "landi",
  "vaxta",
]);

/**
 * Words that fail algorithmic splitting (a part is not a dictionary word
 * form) but are transparent compounds worth decomposing for recall — e.g.
 * "samgöngur" contains "göngur", a word form of "ganga". Values are the
 * explicit part lemmas to index alongside the word itself. Curated from
 * scripts/compound-review.mts output with corpus-frequency evidence.
 */
const ALWAYS_SPLIT_OVERRIDES: Record<string, string[]> = {
  samgöngur: ["ganga"],
  samgöngumál: ["ganga", "mál"],
  samverkamaður: ["maður"],
  námsárangur: ["nám", "árangur"], // algorithmic split picks námsár + angur (junk)
  fíkniefni: ["efni"],
  handtaka: ["hönd", "taka"],
  handhafi: ["hönd", "hafi"],
  fjarvera: ["vera"],
  samvera: ["vera"],
  samkoma: ["koma"],
  samtíma: ["tími"],
  samræða: ["ræða"],
  aflandskróna: ["króna"],
  kaffisamsæti: ["sæti"],
  miðfjarðarrétt: ["rétt"],
  launungarmál: ["mál"],
  tiltökumál: ["mál"],
  æskulýðsmál: ["mál"],
  milliríkjamál: ["mál"],
  flæðarmál: ["mál"],
  klögumál: ["mál"],
  spursmál: ["mál"],
  hávamál: ["mál"],
  samgönguráðherra: ["samgöngur", "ganga", "ráðherra"], // algorithmic: samgönguráð + herra
  samgönguráðuneyti: ["samgöngur", "ganga", "ráðuneyti"],
  landbúnaður: ["land", "búnaður"], // algorithmic: landbú + naður (balance beats sense)
  eftirsóknarverður: ["verður"],
  eftirtektarverður: ["verður"],
  aðfinnsluverður: ["verður"],
};

/**
 * Productive prefixes that attach to otherwise complete words. Keys are the
 * prefix as it appears in the compound (linking letter included); values are
 * the lemma to index for the prefix, or null when the prefix carries no
 * searchable meaning of its own (aðal- "main"). Lets "aðalmeðferð" index
 * just "meðferð" instead of aðal + aðall, and "utanríkisráðherra" index
 * "ráðherra" instead of utan + ríkisráðherra.
 */
export const PRODUCTIVE_PREFIXES: Record<string, string | null> = {
  ríkis: "ríki",
  höfuð: "höfuð",
  aðal: null,
  endur: null, // re- (endurskoða is not önd + skoða)
  utanríkis: null,
  innanríkis: null,
};

/** Parts at least this long are decomposed further (recursive splitting). */
const RECURSE_MIN_LENGTH = 10;
/** Maximum nesting of recursive decomposition. */
const MAX_DEPTH = 3;
/**
 * Among competing noun readings of one surface part, drop lemmas whose
 * corpus-frequency rank is this many times worse than the best reading
 * (stjór next to stjóri, herri next to herra, alþing next to alþingi).
 */
const RARE_HOMOGRAPH_RATIO = 10;
/** Word classes that can be a compound constituent at all. */
const OPEN_CLASS = new Set<string>(["no", "lo", "so"]);
/**
 * Left constituents may also be adverbs, prepositions, numerals and pronouns
 * (gærdagur, útilega, þriðjudagur, sjálfstæði) — anything but articles,
 * conjunctions and interjections.
 */
const LEFT_CLASS = new Set<string>(["no", "lo", "so", "ao", "fs", "to", "fn"]);

interface SplitCandidate {
  leftParts: string[];
  rightParts: string[];
  score: number;
}

interface PartReading {
  lemmas: string[];
  /** Best (lowest) corpus-frequency rank among the lemmas, or Infinity. */
  rank: number;
}

/** 0..1 plausibility of a constituent from its frequency rank (1 = top). */
function rankPlausibility(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  return Math.max(0, 1 - Math.log10(rank + 1) / 6);
}

export class CompoundSplitter {
  private lemmatizer: LemmatizerLike;
  private minPartLength: number;
  private tryLinkingLetters: boolean;
  private knownLemmas: KnownLemmaLookup;
  private mode: CompoundSplitMode;
  /** Cached decomposition per headword, so repeated inflections stay cheap. */
  private headwordSplitCache = new Map<string, CompoundSplit>();
  /** Cached part-lemma selection per surface part. */
  private partLemmaCache = new Map<string, PartReading>();

  constructor(
    lemmatizer: LemmatizerLike,
    knownLemmas: KnownLemmaLookup,
    options: CompoundSplitterOptions = {}
  ) {
    this.lemmatizer = lemmatizer;
    this.knownLemmas = knownLemmas;
    this.minPartLength = options.minPartLength ?? 3;
    this.tryLinkingLetters = options.tryLinkingLetters ?? true;
    this.mode = options.mode ?? "balanced";
  }

  /**
   * Helper to create a no-split result.
   */
  private noSplit(word: string, lemmas: string[]): CompoundSplit {
    return {
      word,
      parts: lemmas,
      indexTerms: lemmas,
      confidence: 0,
      isCompound: false,
    };
  }

  /**
   * Curated short-circuits shared by surface forms and headwords: protected
   * lemmas never split; always-split overrides index explicit parts.
   */
  private curated(
    word: string,
    normalized: string,
    directLemmas: string[]
  ): CompoundSplit | null {
    const primaryLemma = directLemmas[0]?.toLowerCase();
    if (primaryLemma && PROTECTED_LEMMAS.has(primaryLemma)) {
      return this.noSplit(word, directLemmas);
    }
    if (PROTECTED_LEMMAS.has(normalized)) {
      return this.noSplit(word, directLemmas);
    }
    const overrideParts = ALWAYS_SPLIT_OVERRIDES[normalized];
    if (overrideParts) {
      const parts = [...overrideParts];
      const indexTerms = [
        ...new Set([
          ...parts,
          ...directLemmas.map((l) => l.toLowerCase()),
          normalized,
        ]),
      ];
      return { word, parts, indexTerms, confidence: 1, isCompound: true };
    }
    return null;
  }

  /**
   * Decompose a headword (dictionary lemma), recursively and cached.
   *
   * Headwords are split on their own string: the right constituent of a
   * headword is itself in headword form, so its reading is unambiguous
   * (lögreglustjóri → stjóri, never the verb stjóra). Constituents that are
   * long enough to be compounds themselves (or carry a productive prefix)
   * are decomposed further, keeping the intermediate lemma as a part too
   * (lögreglustjóraembætti → lögreglustjóri + embætti → lögregla + stjóri).
   */
  private headwordSplit(lemma: string, depth = 0): CompoundSplit {
    const cached = this.headwordSplitCache.get(lemma);
    if (cached) return cached;

    const directLemmas = this.lemmatizer.lemmatize(lemma);
    const self = this.noSplit(lemma, directLemmas);
    // Cycle guard: a part whose decomposition is in progress is a no-split.
    this.headwordSplitCache.set(lemma, self);

    let result = this.curated(lemma, lemma, directLemmas);
    if (!result) {
      result = self;
      const best = this.bestCandidate(lemma, this.headClasses(lemma));
      if (best) {
        const parts = [...new Set([...best.leftParts, ...best.rightParts])];
        if (depth < MAX_DEPTH) {
          for (const part of [...parts]) {
            if (part === lemma || !this.shouldRecurse(part)) continue;
            const sub = this.headwordSplit(part, depth + 1);
            if (sub.isCompound) {
              for (const p of sub.parts) {
                if (p !== lemma && !parts.includes(p)) parts.push(p);
              }
            }
          }
        }
        result = {
          word: lemma,
          parts,
          indexTerms: [...new Set([...parts, lemma])],
          confidence: Math.min(best.score, 1),
          isCompound: true,
        };
      }
    }
    this.headwordSplitCache.set(lemma, result);
    return result;
  }

  /**
   * Word classes of a word's own readings, or null when unknown. Icelandic
   * compounds are right-headed, so the tail must share a class with the
   * whole: a verb can only be the tail of a verb (endurskoða → skoða), a
   * noun headword never ends in an adjective (ferill is not fer + illur),
   * and a verb reading of a noun's tail is a homograph (lífeyrisþegi is
   * not þegja).
   */
  private headClasses(word: string): Set<string> | null {
    const readings = this.lemmatizer.lemmatizeWithPOS?.(word);
    if (!readings || readings.length === 0) return null;
    const classes = new Set<string>();
    for (const r of readings) if (OPEN_CLASS.has(r.pos)) classes.add(r.pos);
    return classes.size > 0 ? classes : null;
  }

  private shouldRecurse(part: string): boolean {
    if (part.length >= RECURSE_MIN_LENGTH) return true;
    for (const prefix of Object.keys(PRODUCTIVE_PREFIXES)) {
      if (
        part.startsWith(prefix) &&
        part.length - prefix.length >= this.minPartLength
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Try to split a word into compound parts.
   *
   * Uses a lookup-first strategy:
   * 1. Check protected lemmas / curated overrides
   * 2. Known words decompose via their headword(s) — consistent across
   *    inflections, and the headword's own string gives clean readings
   * 3. Otherwise split the surface form algorithmically, with mode-based
   *    confidence gates for known words
   */
  split(word: string): CompoundSplit {
    const normalized = word.toLowerCase();
    const directLemmas = this.lemmatizer.lemmatize(word);
    const primaryLemma = directLemmas[0]?.toLowerCase();

    const curated = this.curated(word, normalized, directLemmas);
    if (curated) return curated;

    // A word is "known" if lemmatization returned something other than the word itself
    const isKnownWord =
      directLemmas.length > 0 && directLemmas[0].toLowerCase() !== normalized;
    const isUnambiguous = directLemmas.length === 1;

    // For conservative mode, only split at hyphens
    if (this.mode === "conservative") {
      if (word.includes("-")) {
        return this.splitAtHyphen(word, directLemmas);
      }
      return this.noSplit(word, directLemmas);
    }

    if (isKnownWord) {
      // Decompose via the headword(s) rather than the inflected surface form:
      // "loftslagsmálum" → "loftslagsmál" → loftslag + mál (not máli/mála),
      // "kjarasamningar" → "kjarasamningur" → kjör + samningur.
      // Only the primary (most frequent) reading is decomposed: a rare
      // homograph headword would otherwise contribute its own split
      // ("flóknum" is flókinn/flókna, not flóki + kinn).
      const hs = this.headwordSplit(primaryLemma!);
      if (hs.isCompound) {
        return {
          word,
          parts: [...hs.parts],
          indexTerms: [...new Set([...hs.parts, primaryLemma!, normalized])],
          confidence: hs.confidence,
          isCompound: true,
        };
      }
      // Balanced mode: short unambiguous known words whose headword is not a
      // compound stay whole.
      if (this.mode === "balanced" && isUnambiguous && normalized.length < 12) {
        return this.noSplit(word, directLemmas);
      }
    } else {
      // Own-lemma word: it is a headword (or unknown) — split its string.
      const hs = this.headwordSplit(normalized);
      if (hs.isCompound) {
        return { ...hs, word, indexTerms: [...new Set([...hs.indexTerms, normalized])] };
      }
      return this.noSplit(word, directLemmas);
    }

    // Known word whose headword does not decompose: fall back to the
    // surface form (core-model gaps, headwords below minPartLength*2).
    if (normalized.length < this.minPartLength * 2) {
      return this.noSplit(word, directLemmas);
    }
    const best = this.bestCandidate(normalized, this.headClasses(normalized));
    if (!best) {
      return this.noSplit(word, directLemmas);
    }
    // In balanced mode, require higher confidence for known words.
    if (this.mode === "balanced" && best.score < 0.6) {
      return this.noSplit(word, directLemmas);
    }
    const parts = [...new Set([...best.leftParts, ...best.rightParts])];
    return {
      word,
      parts,
      indexTerms: [...new Set([...parts, normalized])],
      confidence: Math.min(best.score, 1),
      isCompound: true,
    };
  }

  /**
   * Best-scoring binary split of a string, or null when no split has two
   * valid constituents.
   */
  private bestCandidate(
    normalized: string,
    headClasses: Set<string> | null
  ): SplitCandidate | null {
    if (normalized.length < this.minPartLength * 2) {
      return null;
    }
    let best: SplitCandidate | null = null;
    const consider = (c: SplitCandidate | null) => {
      if (c && (!best || c.score > best.score)) best = c;
    };
    for (
      let i = this.minPartLength;
      i <= normalized.length - this.minPartLength;
      i++
    ) {
      const leftPart = normalized.slice(0, i);
      const rightPart = normalized.slice(i);

      consider(this.trySplit(leftPart, rightPart, headClasses));

      // Try with linking letters removed from split point
      if (this.tryLinkingLetters) {
        for (const linker of LINKING_PATTERNS) {
          if (leftPart.endsWith(linker) && leftPart.length > this.minPartLength) {
            const result = this.trySplit(
              leftPart.slice(0, -1),
              rightPart,
              headClasses
            );
            if (result) {
              // Slightly lower score for linked compounds
              consider({ ...result, score: result.score * 0.95 });
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * Split a hyphenated word.
   */
  private splitAtHyphen(word: string, directLemmas: string[]): CompoundSplit {
    const parts = word.split("-").filter((p) => p.length > 0);
    if (parts.length < 2) {
      return this.noSplit(word, directLemmas);
    }

    const allParts: string[] = [];
    for (const part of parts) {
      const lemmas = this.lemmatizer.lemmatize(part);
      allParts.push(...lemmas);
    }

    const uniqueParts = [...new Set(allParts)];
    const indexTerms = [...new Set([...uniqueParts, word.toLowerCase()])];

    return {
      word,
      parts: uniqueParts,
      indexTerms,
      confidence: 0.9,
      isCompound: true,
    };
  }

  /**
   * Lemmas to index for one surface constituent — a preference ladder over
   * the part's dictionary readings, so homographs of the surface string do
   * not leak into the index:
   *
   * - readings are limited to word classes a constituent can have: the tail
   *   shares a class with the whole word (right-headed), the left part is
   *   any open class plus adverbs/numerals/pronouns (gærdagur, þriðjudagur)
   * - a tail that is itself a noun headword is that lemma only
   *   (stjóri, embætti, mál)
   * - a left part with a genitive reading is that reading
   *   (vaxta → vöxtur, not the noun vaxta; skóla → skóli, not the verb)
   * - noun readings win over adjective/verb readings
   *   (framkvæmda → framkvæmd, not framkvæma)
   * - noun homographs far rarer than the best reading are dropped
   *   (stjór, herri, alþing)
   *
   * Without POS data every known lemma of the part is kept.
   */
  private partLemmas(
    part: string,
    tail: boolean,
    headClasses: Set<string> | null
  ): PartReading {
    const key = tail
      ? `${part}|t|${headClasses ? [...headClasses].sort().join("") : "*"}`
      : `${part}|l`;
    const cached = this.partLemmaCache.get(key);
    if (cached) return cached;
    const result = this.selectPartLemmas(part, tail, headClasses);
    this.partLemmaCache.set(key, result);
    return result;
  }

  private selectPartLemmas(
    part: string,
    tail: boolean,
    headClasses: Set<string> | null
  ): PartReading {
    const readings =
      this.lemmatizer.lemmatizeWithMorph?.(part) ??
      this.lemmatizer.lemmatizeWithPOS?.(part);
    if (!readings) {
      const lemmas = [
        ...new Set(
          this.lemmatizer.lemmatize(part).filter((l) => this.knownLemmas.has(l))
        ),
      ];
      return { lemmas, rank: Number.POSITIVE_INFINITY };
    }

    const byLemma = new Map<
      string,
      { noun: boolean; genitive: boolean; rank: number }
    >();
    for (const r of readings as LemmaWithMorph[]) {
      const lemma = r.lemma.toLowerCase();
      if (!this.knownLemmas.has(lemma) || NEVER_PART_LEMMAS.has(lemma)) continue;
      if (tail) {
        // Right-headed: the tail shares a word class with the whole.
        if (headClasses ? !headClasses.has(r.pos) : !OPEN_CLASS.has(r.pos)) continue;
      } else if (!LEFT_CLASS.has(r.pos)) {
        continue;
      }
      const entry = byLemma.get(lemma) ?? {
        noun: false,
        genitive: false,
        rank: Number.POSITIVE_INFINITY,
      };
      if (r.pos === "no") entry.noun = true;
      if (r.morph?.case === "ef") entry.genitive = true;
      if (r.rank !== undefined && r.rank < entry.rank) entry.rank = r.rank;
      byLemma.set(lemma, entry);
    }
    if (byLemma.size === 0) return { lemmas: [], rank: Number.POSITIVE_INFINITY };

    let pool = [...byLemma];
    if (tail) {
      // The tail of a headword is itself in headword form.
      const identity = byLemma.get(part);
      if (identity?.noun) return { lemmas: [part], rank: identity.rank };
    } else {
      // A left constituent is a genitive (lögreglu-, vaxta-) or a bare
      // stem; when the form has a genitive reading, that is the one
      // (vaxta → vöxtur, not the noun vaxta; skóla → skóli, not the verb).
      const genitive = pool.filter(([, v]) => v.genitive);
      if (genitive.length > 0) pool = genitive;
    }

    const nouns = pool.filter(([, v]) => v.noun);
    if (nouns.length > 0) pool = nouns;
    if (pool.length === 0) return { lemmas: [], rank: Number.POSITIVE_INFINITY };

    const bestRank = Math.min(...pool.map(([, v]) => v.rank));
    if (Number.isFinite(bestRank)) {
      const limit = (bestRank + 1) * RARE_HOMOGRAPH_RATIO;
      pool = pool.filter(([, v]) => v.rank + 1 <= limit);
    }
    return { lemmas: pool.map(([lemma]) => lemma), rank: bestRank };
  }

  private trySplit(
    leftPart: string,
    rightPart: string,
    headClasses: Set<string> | null
  ): SplitCandidate | null {
    // A compound part must be a real dictionary word form. Reject parts that
    // only resolve via the unknown-form suffix fallback — e.g. "slán" in
    // "húsnæðislán" must not pass as "slá" (strike) through suffix stripping,
    // or the correct "lán" split would lose to a nonsense one.
    if (!this.lemmatizer.isKnown?.(rightPart)) {
      return null;
    }
    const prefixLemma = PRODUCTIVE_PREFIXES[leftPart];
    const isPrefix = prefixLemma !== undefined;
    if (!isPrefix && !this.lemmatizer.isKnown?.(leftPart)) {
      return null;
    }

    const left = isPrefix
      ? { lemmas: prefixLemma && this.knownLemmas.has(prefixLemma) ? [prefixLemma] : [], rank: Number.POSITIVE_INFINITY }
      : this.partLemmas(leftPart, false, null);
    const right = this.partLemmas(rightPart, true, headClasses);
    const leftKnown = left.lemmas;
    const rightKnown = right.lemmas;

    if ((!isPrefix && leftKnown.length === 0) || rightKnown.length === 0) {
      return null;
    }

    // Reject derivational-suffix splits: the right part is an agent-noun /
    // adverb / diminutive suffix, never a genuine compound part (kennari →
    // kenna + ari, ágætlega → ágætur + lega).
    if (
      DERIVATIONAL_SUFFIX_LEMMAS.has(rightPart) ||
      rightKnown.some((l) => DERIVATIONAL_SUFFIX_LEMMAS.has(l))
    ) {
      return null;
    }

    // Calculate score with multiple factors
    let score = 0;

    // Factor 1: Length balance (20% weight)
    // Prefer balanced splits, but not too strictly
    const lengthBalance =
      1 - Math.abs(leftPart.length - rightPart.length) / (leftPart.length + rightPart.length);
    score += lengthBalance * 0.2;

    // Factor 2: Part length bonus (20% weight)
    // Prefer longer parts (more likely to be real words)
    const avgLength = (leftPart.length + rightPart.length) / 2;
    const lengthBonus = Math.min(avgLength / 6, 1);
    score += lengthBonus * 0.2;

    // Factor 3: Common compound tail bonus (30% weight)
    // Strongly prefer splits where right part is a known compound tail
    const hasCompoundTail = rightKnown.some((lemma) => COMMON_COMPOUND_TAILS.has(lemma));
    if (hasCompoundTail) {
      score += 0.3;
    }

    // Factor 4: Penalty for both parts being common standalone words (30% weight)
    // E.g., "ísland" -> "ís" + "land" should be penalized
    const leftIsCommon = leftKnown.some((lemma) => COMMON_STANDALONE.has(lemma));
    const rightIsCommon = rightKnown.some((lemma) => COMMON_STANDALONE.has(lemma));
    if (leftIsCommon && rightIsCommon) {
      // Strong penalty if both parts are very common standalone
      score -= 0.3;
    } else if (!leftIsCommon && !rightIsCommon) {
      // Bonus if neither is a common standalone (more likely a real compound)
      score += 0.2;
    }

    // Factor 5: Minimum part length requirement
    // Very short parts (2-3 chars) get a penalty
    if (leftPart.length < 4 || rightPart.length < 4) {
      score -= 0.15;
    }

    // Factor 6: constituent plausibility from corpus-frequency rank (5%).
    // Breaks near-ties toward frequent constituents: höfuðborg + svæði over
    // höfuð + borgarsvæði, ríkis + lögregla over ríkislög + regla.
    const ranks = [left.rank, right.rank].filter((r) => Number.isFinite(r));
    if (ranks.length > 0) {
      score +=
        (ranks.reduce((a, r) => a + rankPlausibility(r), 0) / ranks.length) *
        0.05;
    }

    return {
      leftParts: leftKnown,
      rightParts: rightKnown,
      score: Math.max(0, score), // Ensure non-negative
    };
  }

  /**
   * Get all lemmas for a word, including compound parts.
   * Useful for search indexing.
   */
  getAllLemmas(word: string): string[] {
    const split = this.split(word);
    return split.indexTerms;
  }
}

/**
 * Create a set of known lemmas from the lemmatizer.
 * This is used to check if compound parts are valid words.
 */
export function createKnownLemmaSet(lemmas: string[]): Set<string> {
  return new Set(lemmas.map((l) => l.toLowerCase()));
}

export interface KnownLemmaLookup {
  has(lemma: string): boolean;
}

export interface KnownLemmaFilterOptions extends BloomFilterOptions {}

/**
 * Create a compact lookup for known lemmas using a Bloom filter.
 * False positives are possible (more splits), false negatives are not.
 */
export function createKnownLemmaFilter(
  lemmas: string[],
  options: KnownLemmaFilterOptions = {}
): KnownLemmaLookup {
  const normalized = lemmas.map((l) => l.toLowerCase());
  return BloomFilter.fromValues(normalized, options);
}
