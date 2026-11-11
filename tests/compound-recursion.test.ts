/**
 * Regression tests for recursive compound decomposition and constituent
 * reading selection (the althingi-search batch).
 *
 * Expectations were checked against BÍN readings: every expected part is a
 * BÍN headword that is a genuine constituent; every "junk" entry is a
 * homograph of a constituent's surface string (the verb stjóra for stjóri,
 * the rare noun stjór, the verb embætta for embætti, ...) that used to leak
 * into parts/indexTerms.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BinaryLemmatizer,
  CompoundSplitter,
  createKnownLemmaSet,
  extractIndexableLemmas,
  processText,
} from "../src/index.js";

const load = (name: string) => {
  const buffer = readFileSync(join(import.meta.dirname, "..", "data-dist", name));
  return BinaryLemmatizer.loadFromBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
};

/** [word, expected parts (all must be present), junk (none may be present)] */
const TABLE: [string, string[], string[]][] = [
  // The althingi repro words
  ["lögreglustjóraembættin", ["lögreglustjóri", "embætti", "lögregla", "stjóri"], ["embætta", "stjóra", "stjór"]],
  ["ríkislögreglustjóri", ["ríkislögregla", "stjóri", "ríki", "lögregla"], ["stjóra", "stjór", "ríkir", "ríkja", "ríkur"]],
  ["lögreglustjóri", ["lögregla", "stjóri"], ["stjóra", "stjór", "lög", "regla"]],
  ["aðalmeðferð", ["meðferð"], ["aðal", "aðall"]],
  ["loftslagsmálum", ["loftslag", "mál"], ["máli", "mála"]],
  ["heilbrigðisráðherra", ["heilbrigði", "ráðherra"], ["heilbrigður", "heill", "brigði"]],
  // Ministers, ministries, institutions
  ["fjármálaráðherra", ["fjármál", "ráðherra"], ["máli", "mála"]],
  ["umhverfisráðuneytið", ["umhverfi", "ráðuneyti"], ["umhverfis", "umhverfa", "umhverfur"]],
  ["sjávarútvegsráðherra", ["sjávarútvegur", "ráðherra", "sjór", "útvegur"], ["sjár"]],
  ["utanríkisráðherra", ["ráðherra"], ["utan", "ríkisráðherra"]],
  ["dómsmálaráðherra", ["dómsmál", "ráðherra"], ["máli"]],
  ["forsætisráðherra", ["forsæti", "ráðherra"], []],
  ["samgönguráðherra", ["samgöngur", "ráðherra"], ["herra", "herri", "samgönguráð"]],
  ["landbúnaðarráðherra", ["landbúnaður", "ráðherra", "land", "búnaður"], ["naður", "landbú"]],
  ["menntamálaráðuneytið", ["menntamál", "ráðuneyti"], ["máli"]],
  ["ríkisstjórnin", ["ríki", "stjórn"], ["ríkir", "ríkja", "ríkur"]],
  ["ríkisútvarpið", ["ríki", "útvarp"], ["ríkir", "útvarpa"]],
  ["eftirlitsstofnun", ["eftirlit", "stofnun"], []],
  ["alþingismenn", ["alþingi", "maður"], ["menna", "alþing"]],
  ["þingmaður", ["þing", "maður"], []],
  ["sveitarfélögin", ["sveit", "félag"], ["sveita"]],
  ["höfuðborgarsvæðið", ["höfuðborg", "svæði", "höfuð", "borg"], ["borga"]],
  ["Evrópusambandið", ["evrópa", "samband"], []],
  // Economy, welfare, labour
  ["húsnæðislánasjóður", ["húsnæðislán", "sjóður", "húsnæði", "lán"], []],
  ["heilbrigðisþjónusta", ["heilbrigði", "þjónusta"], ["heilbrigður", "heill"]],
  ["leikskólakennarar", ["leikskóli", "kennari"], ["kenna", "ari"]],
  ["kjarasamningar", ["kjör", "samningur"], ["samning"]],
  ["veiðigjaldið", ["veiði", "gjald"], ["veiða", "veiðir", "veiður", "gjalda", "veiðar"]],
  ["hælisleitendur", ["hæli", "leitandi"], ["hælir", "hæll", "hæla", "leita"]],
  ["orkuskipti", ["orka", "skipti"], ["skipta", "skiptir", "skiptur"]],
  ["atvinnuleysisbætur", ["atvinnuleysi", "bót"], ["leysir"]],
  ["barnabætur", ["barn", "bót"], ["barna"]],
  ["vaxtabætur", ["vöxtur", "bót"], ["vaxta"]],
  ["fjárlagafrumvarpið", ["fjárlög", "frumvarp"], []],
  ["skattkerfið", ["skattur", "kerfi"], ["kerfa"]],
  ["tekjuskattur", ["tekja", "skattur"], []],
  ["virðisaukaskattur", ["virðisauki", "skattur", "virði", "auki"], ["virðir"]],
  ["vinnumarkaðurinn", ["vinna", "markaður"], ["marka"]],
  ["verkalýðsfélög", ["verkalýður", "félag", "verk", "lýður"], ["verki"]],
  ["ellilífeyrisþegar", ["elli", "lífeyrisþegi"], ["þegar", "þegja", "ell"]],
  ["hjúkrunarheimili", ["hjúkrun", "heimili"], ["heimila", "heimill"]],
  ["sjúkrahúsin", ["sjúkur", "hús"], []],
  // Democracy, law
  ["þjóðaratkvæðagreiðsla", ["þjóðaratkvæði", "greiðsla", "þjóð", "atkvæði"], []],
  ["stjórnarskrárbreytingar", ["stjórnarskrá", "breyting", "stjórn", "skrá"], ["stjórna"]],
  ["lagafrumvarp", ["lög", "frumvarp"], ["lagi", "lögur", "laga"]],
  ["fiskveiðistjórnunarkerfið", ["fiskveiðistjórnun", "kerfi", "fiskveiði", "stjórnun"], ["kerfa"]],
  ["lögreglumenn", ["lögregla", "maður"], ["menna", "lög", "regla"]],
  ["framkvæmdastjóri", ["framkvæmd", "stjóri"], ["framkvæma", "framkvæmdur", "stjóra", "stjór"]],
  ["bankastjóri", ["banki", "stjóri"], ["banka", "bank", "stjóra"]],
  ["aðalatriði", ["atriði"], ["aðal", "aðall", "atriðast"]],
  ["aðalfundur", ["fundur"], ["aðal", "aðall"]],
  ["endurskoða", ["skoða"], ["önd", "endur"]],
];

describe("Recursive compound decomposition (full model)", () => {
  let full: BinaryLemmatizer;
  let splitter: CompoundSplitter;

  beforeAll(() => {
    full = load("lemma-is.bin");
    splitter = new CompoundSplitter(full, createKnownLemmaSet(full.getAllLemmas()));
  });

  it.each(TABLE)("split(%s) → %j, never %j", (word, expected, junk) => {
    const result = splitter.split(word);
    expect(result.isCompound).toBe(true);
    for (const part of expected) expect(result.parts).toContain(part);
    for (const bad of junk) {
      expect(result.parts).not.toContain(bad);
      expect(result.indexTerms).not.toContain(bad);
    }
  });

  it("keeps intermediate compounds as parts and in indexTerms", () => {
    const r = splitter.split("lögreglustjóraembættin");
    expect(r.parts).toEqual(["lögreglustjóri", "embætti", "lögregla", "stjóri"]);
    expect(r.indexTerms).toContain("lögreglustjóraembætti");
    expect(r.indexTerms).toContain("lögreglustjóraembættin");
  });

  it("decomposes consistently across inflections (via the headword)", () => {
    for (const form of ["lögreglustjóri", "lögreglustjóra", "lögreglustjórann", "lögreglustjóranum", "lögreglustjórar"]) {
      expect(splitter.split(form).parts).toEqual(["lögregla", "stjóri"]);
    }
  });

  it("parts are headwords only (every part lemmatizes to itself)", () => {
    for (const [word] of TABLE) {
      for (const part of splitter.split(word).parts) {
        expect(full.lemmatize(part), `${word} → ${part}`).toContain(part);
      }
    }
  });

  it("recursion is bounded: short lexicalized constituents stay whole", () => {
    // lögregla (8 letters) is below the recursion length and protected
    expect(splitter.split("lögregla").isCompound).toBe(false);
    expect(splitter.split("heilbrigði").isCompound).toBe(false);
    expect(splitter.split("fjármálaráðherra").parts).not.toContain("mál");
  });

  it("right-headedness: a noun never takes a verb or adjective tail", () => {
    expect(splitter.split("ellilífeyrisþegar").parts).not.toContain("þegja");
    expect(splitter.split("umsagnarferli").parts).toEqual(["umsögn", "ferli"]);
    // ... but a verb headword does take a verb tail
    expect(splitter.split("endurskoða").parts).toEqual(["skoða"]);
  });

  it("productive prefixes strip cleanly in the surface path too", () => {
    expect(splitter.split("aðalmeðferð").parts).toEqual(["meðferð"]);
    expect(splitter.split("ríkisstjórn").parts).toEqual(["ríki", "stjórn"]);
    expect(splitter.split("höfuðborg").parts).toEqual(["höfuð", "borg"]);
  });

  it("the pipeline indexes parts as-is (no homograph expansion)", () => {
    const opts = { bigrams: full, compoundSplitter: splitter, removeStopwords: true };
    const idx = [...extractIndexableLemmas("heilbrigðisráðherra ríkislögreglustjóri", full, opts)];
    expect(idx).toEqual(
      expect.arrayContaining(["heilbrigðisráðherra", "heilbrigði", "ráðherra", "ríkislögreglustjóri", "ríkislögregla", "stjóri", "ríki", "lögregla"])
    );
    for (const bad of ["heilbrigður", "stjóra", "stjór", "ríkir", "ríkja", "ríkur"]) expect(idx).not.toContain(bad);
    const token = processText("lögreglustjóraembættin", full, opts)[0];
    expect(token.compoundLemmas).toEqual(["lögreglustjóri", "embætti", "lögregla", "stjóri"]);
  });

  it("curated short simplex words with accidental splits stay whole", () => {
    for (const word of ["lítil", "heimilt", "flóknara", "þekkingu", "forsendur", "kostnaðurinn", "tilfellum", "höfundar", "pólitísk"]) {
      expect(splitter.split(word).isCompound, word).toBe(false);
    }
  });
});

describe("Recursive compound decomposition (core model)", () => {
  it("still decomposes the repro words without morph data", () => {
    const core = load("lemma-is.core.bin");
    const splitter = new CompoundSplitter(core, createKnownLemmaSet(core.getAllLemmas()));
    const r = splitter.split("ríkislögreglustjóri");
    expect(r.parts).toContain("stjóri");
    expect(r.parts).toContain("lögregla");
    expect(r.parts).not.toContain("stjóra");
    expect(r.parts).not.toContain("stjór");
    expect(splitter.split("lögreglustjóraembættin").parts).toContain("lögregla");
  });
});
