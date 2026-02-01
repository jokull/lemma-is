#!/usr/bin/env python3
"""Fetch samples from HuggingFace IGC-2024 dataset for coverage testing.

Usage:
  uv run python scripts/benchmark/igc/fetch_igc_2024.py --output data/igc/igc-2024-samples.jsonl --samples-per-config 50
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from datasets import load_dataset


# Subset of configs for testing - representative of different text types
CONFIGS = [
    "wiki",  # Wikipedia - general text
    "news1_frettabladid_is",  # News
    "journals_mf",  # Journals
    "law_law",  # Legal text
    "social_blog_silfuregils",  # Social/informal
    "parla",  # Parliamentary
    "adjud_supreme",  # Judicial
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="data/igc/igc-2024-samples.jsonl",
        help="Output JSONL path",
    )
    parser.add_argument(
        "--samples-per-config",
        type=int,
        default=50,
        help="Number of documents to sample per config",
    )
    parser.add_argument(
        "--max-doc-chars",
        type=int,
        default=5000,
        help="Truncate documents longer than this",
    )
    parser.add_argument(
        "--configs",
        nargs="+",
        default=CONFIGS,
        help="Dataset configs to sample from",
    )
    parser.add_argument(
        "--list-configs",
        action="store_true",
        help="List available configs and exit",
    )
    return parser.parse_args()


def list_configs() -> None:
    """List all available configs in the dataset."""
    from datasets import get_dataset_config_names

    configs = get_dataset_config_names("arnastofnun/IGC-2024")
    print("Available configs:")
    for c in sorted(configs):
        print(f"  {c}")


def main() -> int:
    args = parse_args()

    if args.list_configs:
        list_configs()
        return 0

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    total_docs = 0
    total_chars = 0

    with out_path.open("w", encoding="utf-8") as out_f:
        for config in args.configs:
            print(f"Fetching {config}...", file=sys.stderr)
            try:
                ds = load_dataset(
                    "arnastofnun/IGC-2024",
                    config,
                    split="train",
                    streaming=True,
                )
            except Exception as e:
                print(f"  Failed to load {config}: {e}", file=sys.stderr)
                continue

            count = 0
            for doc in ds:
                if count >= args.samples_per_config:
                    break

                text = doc.get("document", "")
                if not text or len(text.strip()) < 100:
                    continue

                # Truncate long documents
                if len(text) > args.max_doc_chars:
                    text = text[: args.max_doc_chars]

                record = {
                    "config": config,
                    "uuid": doc.get("uuid", ""),
                    "text": text,
                }
                out_f.write(json.dumps(record, ensure_ascii=False) + "\n")

                count += 1
                total_docs += 1
                total_chars += len(text)

            print(f"  Sampled {count} documents", file=sys.stderr)

    print(
        f"\nTotal: {total_docs} documents, {total_chars:,} characters",
        file=sys.stderr,
    )
    print(f"Output: {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
