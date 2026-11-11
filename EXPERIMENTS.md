# Experiments log (hill climbing)

lemma-is is tuned for **search recall and indexing**, and that is a balancing act: over-indexing compound parts and
alternative readings sometimes helps recall, sometimes floods results with noise. We improve by small, recorded steps.
Every change that alters what gets indexed gets an entry here **before** it ships — hypothesis, change, measurement,
verdict, decision — plus the directions we tried and rejected, so we never swing back into them.

## Rules of the climb

1. **Small steps.** One hypothesis per experiment; a batch may hold several, each listed separately with its own verdict.
2. **Rules where reliable, curated lists for the long tail.** A general rule must hold across the corpus; a short curated
   list beats widening a rule for a handful of words; a pile of one-offs where a principled rule exists is a smell.
3. **Measure the balance, not just the fix.** Report net index-term change on a real corpus sample (terms added / removed,
   with samples of each) and a blind relevance judgment on a downstream search (althingi-search A/B, see below).
4. **Prefer fixing on the consumer side** (query weighting, part weight, phrase handling) when the problem lives there.
5. **Default changes need evidence; arguable changes go behind an option.**
6. **Record the dead ends** in "Directions not to repeat".

## How to measure (current harness)

- Unit/regression: `pnpm test` (tests/compound-recursion.test.ts holds the parliamentary compound table).
- Index-term diff on 2,458 docs (IGC samples + althingi fixture paragraphs): `corpus-diff.ts` (kept in the althingi
  session scratchpad; move into `scripts/` when it stabilises).
- Downstream blind A/B: althingi-search full session-157 corpus (11,974 speeches) restored twice locally, one reindexed
  with the candidate; `scripts/ab-search.ts` in ~/Code/althingi prints top-N per query; a blind judge (model `fable`)
  scores P@5 with the strict rubric in ~/Code/althingi/docs/EVAL-phase0.md, unaware which side is the baseline.
- Objective downstream signal: althingi `scripts/eval.ts` auto MRR (100 random matter titles → speeches on that matter).

## Log

### E0 — althingi-side indexing rounds v1–v5 (2026-11-10, lemma-is 0.12.0, no lemma-is change)

Recorded in ~/Code/althingi/docs/EVAL-phase0.md. Relevant to lemma-is:
- Compound parts indexed at full weight polluted results → parts moved to a separate low-weight field (consumer side). **Kept.**
- Query side expanding *known* dictionary compounds into their parts (verðbólga ↔ verð; lögregla ↔ lög & regla)
  hurt precision → known words are searched whole; only unknown compounds get per-part groups. **Kept.**
- `ts_rank_cd` length normalisation flag 0 → net regression. **Rejected.**
- Set → multiset (term frequency) → slight quality gain, new risk that repetitive off-topic paragraphs reach rank 1. **Kept**, cap TF considered.
- Open finding that motivated E1: splitter stops at the first binary split (lögreglustjóraembættin, ríkislögreglustjóri never yield `lögregla`).

### E1 — batch/althingi-fixes: recursive splitting + reading selection + junk-part cleanup (2026-11-11)

Branch `batch/althingi-fixes` (68b5b34, 1fba35a, 16e61f3) on 0.12.0.

| # | change | kind | why |
|---|---|---|---|
| 1 | Pipeline indexes compound parts as-is, no re-lemmatising of headwords | rule | re-lemmatising expanded parts into homographs (stjóri→stjóra/stjór, heilbrigði→heilbrigður) |
| 2 | Known words decompose via their **primary** headword | rule | consistent across inflections; unioning all readings split `flóknum` via rare `flóki` |
| 3 | Constituent reading selection: tail shares word class with whole; noun tail → that lemma; genitive left reading; noun over verb/adj; drop readings ≥10× rarer | rule | kills verb/adj homographs as parts |
| 4 | Recursion into constituents ≥10 letters or with productive prefix; bounded, cached; intermediates kept | rule | `lögreglustjóraembætti` → … + `lögregla`; 10-letter floor stops `lögregla` → lög+regla |
| 5 | 5 % frequency factor in split scoring | rule | near-tie breaking (höfuðborg+svæði over höfuð+borgarsvæði) |
| 6 | `X- og/eða/né Y` coordination reconstruction | rule | `umhverfis- og samgöngunefnd` produced lemma " og samgöngunefnd" (committee search matched 1,089 speeches) |
| 7 | No suffix-stripped guess for decomposed unknown words | rule | `vindorkuverkefna` → truncated `vindorkuverkefn` |
| 8 | `PRODUCTIVE_PREFIXES` (6), `NEVER_PART_LEMMAS` (6), +3 `ALWAYS_SPLIT_OVERRIDES`, +16 `PROTECTED_LEMMAS`, +3 derivational tails | curated | long tail where rules misfire |

Measured (index-term diff, 2,458 docs, balanced): unique doc-level index terms 172,644 → 147,468 (**−14.6 %**);
removed 3,670 distinct (top: staði, viða, inni, sjár, lögur, ingi, stjóra, stjór, máli, lagi — homographs/truncations);
added 865 distinct (top: völlur, lýsing, þjóð, þing, ríki, lögregla, búnaður). Arguable losses: `dagur` (gjalddaga),
`smíði` (tónsmíðum), `löggjafi` → löggjöf, `veiðar` → veiði (selveiðar). Perf: comparable (splits slightly slower,
paragraphs faster via headword cache).

Downstream (althingi full 157 corpus): auto MRR 0.809 → **0.842**. DB p95 33.8 → 27.9 ms.
Blind judge (fable, 49 queries: 19 golden, 20 compound-stress, 10 own probes; X = branch, Y = 0.12.0, unblinded after):
mean P@5 branch 0.776 vs 0.12.0 0.788 — **parity as a package** (2 wins, 2 losses, 45 ties; golden set saturated, 18/19 tie).
Signal is per behaviour:
- **Coordination (branch worse):** `umhverfis- og samgöngunefnd` → query OR-group included the bare shared head `nefnd`
  (`mennta- og barnamálaráðherra` → bare `ráðherra`), flooding results with generic committee/minister speeches
  (P@5 0.4 / 0.2 vs 0.8 / 1.0 on 0.12.0).
- **Part-only matches (0.12.0 over-ranked them, branch better):** with 0.12.0, documents containing only
  `heilbrigðis-`/`framhalds-`/`umhverfis-` compounds outranked exact-lemma documents (`framhald` 1.0 vs 0.6).
- **Deep heads (branch only):** `framhaldsskólakennari` → `kennari` (kennarar kjarasamningar 3 hits vs 2).
- Equal in both, not differentiators: head-part indexing (stjóri, gjald, skóli, orka), homograph noise (heilbrigður,
  hæla, vinda), idioms (gera ráð fyrir), proper-name collisions (Jens Garðar → garður), OOV compounds with zero hits.

Verdict: keep the batch, fix coordination. Decision: → E2.

### E2 — coordination never emits the shared tail as a part (2026-11-11)

Hypothesis: in `X- og Y` the shared tail (nefnd, ráðherra, miðlun) is the generic head of both words; as a part it is
pure noise at query time. Change (rule): `coordinationWords` returns the reconstructed tail; its lemmas are filtered out
of the coordination token's compound parts. Full words and modifiers kept (`umhverfisnefnd, samgöngunefnd, umhverfi`).
Tests: compound-recursion asserts no bare `nefnd` / `ráðherra` / `miðlun`. Suite 411 passed.
Blind re-judge: _pending_.

## Directions not to repeat

- Splitting **known** dictionary compounds on the query side (E0): precision loss outweighs recall gain.
- `ts_rank_cd` normalisation flag 0 (E0).
- Unioning all lemma readings of a known word before decomposing (E1 #2): splits via rare homographs.
- Lowering the recursion floor so 8-letter constituents split (E1 #4): `lögregla` → lög+regla reintroduces `-lög` noise.
- Emitting the bare shared head of a hyphen coordination in any form (E1 → E2).
- Dropping modifier- or head-part indexing altogether (E1 judge): parts carry real recall (loftslag, hæli, strönd, kennari).
- Pruning alternative readings to fix homograph noise (E1 judge): equal in both variants, not where quality is lost.
- Fixing idiom / proper-name noise through decomposition (E1 judge): wrong layer.
- More golden-topic queries to decide lemma changes (E1 judge): saturated; use simplex-vs-compound and coordination probes.
