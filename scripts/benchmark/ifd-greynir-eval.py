#!/usr/bin/env python3
"""Evaluate GreynirEngine full parsing lemma recall/overindexing vs IFD gold JSONL.

This script can resume from a state file to avoid long single runs.
"""

from __future__ import annotations

import argparse
import json
import time
import resource
from typing import List, Tuple
from pathlib import Path

STATE_PATH = Path("data/ifd/ifd-greynir-state.json")
TIME_BUDGET_SEC = 90  # Stop and save state after this many seconds


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", required=True, help="IFD JSONL path")
    parser.add_argument("--reset", action="store_true", help="Reset saved state")
    parser.add_argument("--max-sentences", type=int, default=0, help="Limit sentences processed")
    return parser.parse_args()


def init_agg() -> dict:
    return {
        "sentences": 0,
        "tokens": 0,
        "goldFound": 0,
        "oovTokens": 0,
        "totalCandidates": 0,
        "totalExtraCandidates": 0,
        "parsedTokens": 0,
        "parsedGoldFound": 0,
        "parseFailures": 0,
        "alignmentMismatches": 0,
        "greynirTokens": 0,
    }


def summarize(agg: dict) -> dict:
    tokens = agg["tokens"]
    recall = agg["goldFound"] / tokens if tokens else 0
    oov_rate = agg["oovTokens"] / tokens if tokens else 0
    avg_candidates = agg["totalCandidates"] / tokens if tokens else 0
    extra_rate = (
        agg["totalExtraCandidates"] / agg["totalCandidates"]
        if agg["totalCandidates"]
        else 0
    )
    parse_fail_rate = agg["parseFailures"] / agg["sentences"] if agg["sentences"] else 0
    parsed_tokens = agg["parsedTokens"]
    parsed_recall = agg["parsedGoldFound"] / parsed_tokens if parsed_tokens else 0

    return {
        "sentences": agg["sentences"],
        "tokens": tokens,
        "recall": recall,
        "missingRate": 1 - recall,
        "oovRate": oov_rate,
        "avgCandidatesPerToken": avg_candidates,
        "extraCandidatesPerToken": agg["totalExtraCandidates"] / tokens if tokens else 0,
        "extraRate": extra_rate,
        "parseFailureRate": parse_fail_rate,
        "parsedTokens": parsed_tokens,
        "parsedRecall": parsed_recall,
        "alignmentMismatchTokens": agg["alignmentMismatches"],
        "greynirTokens": agg["greynirTokens"],
    }


def max_rss_mb() -> float:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if rss > 10**8:
        return rss / (1024 * 1024)
    return rss / 1024


def align_tokens(
    gold_tokens: List[dict],
    greynir_tokens: List[Tuple[str, str]],
) -> List[Tuple[str, str, str, bool]]:
    aligned = []
    gi = 0
    for tok in gold_tokens:
        form = tok["form"]
        gold_lemma = tok["lemma"].lower()
        if gi >= len(greynir_tokens):
            aligned.append((form, gold_lemma, "", True))
            continue
        g_text, g_lemma = greynir_tokens[gi]
        mismatch = g_text != form
        aligned.append((form, gold_lemma, g_lemma.lower(), mismatch))
        gi += 1
    return aligned


def load_state() -> dict:
    if STATE_PATH.exists():
        with STATE_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "index": 0,
        "total": init_agg(),
        "byCategory": {},
    }


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w", encoding="utf-8") as f:
        json.dump(state, f)


def main() -> int:
    args = parse_args()

    if args.reset and STATE_PATH.exists():
        STATE_PATH.unlink()

    from reynir import Greynir  # type: ignore
    from tokenizer import TOK  # type: ignore

    base_rss = max_rss_mb()
    g = Greynir()

    state = load_state()
    start_index = int(state.get("index", 0))
    total = state.get("total", init_agg())
    by_category = state.get("byCategory", {})

    start = time.perf_counter()

    with open(args.gold, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            if idx < start_index:
                continue
            if args.max_sentences and total["sentences"] >= args.max_sentences:
                break
            if not args.max_sentences and time.perf_counter() - start > TIME_BUDGET_SEC:
                state["index"] = idx
                state["total"] = total
                state["byCategory"] = by_category
                save_state(state)
                print(json.dumps({"status": "partial", "index": idx}))
                return 2

            line = line.strip()
            if not line:
                continue
            sent = json.loads(line)
            category = sent.get("category") or "unknown"
            if category not in by_category:
                by_category[category] = init_agg()
            agg = by_category[category]

            total["sentences"] += 1
            agg["sentences"] += 1

            sentence_text = sent.get("text") or " ".join(t["form"] for t in sent["tokens"])
            parsed = g.parse_single(sentence_text)
            if parsed is None or parsed.lemmas is None or parsed.terminals is None:
                total["parseFailures"] += 1
                agg["parseFailures"] += 1
                token_count = len(sent["tokens"])
                total["tokens"] += token_count
                agg["tokens"] += token_count
                total["oovTokens"] += token_count
                agg["oovTokens"] += token_count
                continue

            tokens = parsed.tokens
            greynir_tokens: List[Tuple[str, str]] = []
            for terminal in parsed.terminals:
                if terminal.index >= len(tokens):
                    continue
                tok = tokens[terminal.index]
                if tok.kind != TOK.WORD:
                    continue
                greynir_tokens.append((tok.txt or terminal.text, terminal.lemma))
            total["greynirTokens"] += len(greynir_tokens)
            agg["greynirTokens"] += len(greynir_tokens)

            aligned = align_tokens(sent["tokens"], greynir_tokens)

            for _, gold, gl, mismatch in aligned:
                total["tokens"] += 1
                agg["tokens"] += 1

                if not gl:
                    total["alignmentMismatches"] += 1
                    agg["alignmentMismatches"] += 1
                    total["oovTokens"] += 1
                    agg["oovTokens"] += 1
                    continue
                if mismatch:
                    total["alignmentMismatches"] += 1
                    agg["alignmentMismatches"] += 1

                total["totalCandidates"] += 1
                agg["totalCandidates"] += 1
                total["parsedTokens"] += 1
                agg["parsedTokens"] += 1

                if gold == gl:
                    total["goldFound"] += 1
                    agg["goldFound"] += 1
                    total["parsedGoldFound"] += 1
                    agg["parsedGoldFound"] += 1
                else:
                    total["totalExtraCandidates"] += 1
                    agg["totalExtraCandidates"] += 1

    elapsed = time.perf_counter() - start
    words_per_sec = total["tokens"] / elapsed if elapsed else 0
    rss_mb = max_rss_mb()

    if STATE_PATH.exists():
        STATE_PATH.unlink()

    result = {
        "gold": args.gold,
        "summary": summarize(total),
        "byCategory": {k: summarize(v) for k, v in by_category.items()},
        "throughputWordsPerSec": words_per_sec,
        "rssMB": rss_mb,
        "rssDeltaMB": rss_mb - base_rss,
    }

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
