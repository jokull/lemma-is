#!/usr/bin/env python3
"""Parse IGC-Journals.ana TEI XML into JSONL sentences with gold lemmas/POS.

Usage:
  python3 scripts/benchmark/igc/parse_igc.py --input /Users/jokull/Downloads/IGC-Journals-22.10.ana --output data/igc/igc.jsonl --max-sentences 2000
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

TEI_NS = "http://www.tei-c.org/ns/1.0"
NS = {"tei": TEI_NS}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="IGC-Journals-22.10.ana directory")
    parser.add_argument("--output", required=True, help="Output JSONL path")
    parser.add_argument("--max-sentences", type=int, default=0, help="Limit total sentences")
    return parser.parse_args()


def build_sentence_text(tokens: list[str]) -> str:
    text = " ".join(tokens)
    text = re.sub(r"\s+([,.;:!?])", r"\\1", text)
    text = re.sub(r"\s+([\)\]\}])", r"\\1", text)
    text = re.sub(r"([\(\[\{])\s+", r"\\1", text)
    text = re.sub(r"(\u201E|\u201C|\u2018|\u00AB)\s+", r"\\1", text)
    text = re.sub(r"\s+(\u201D|\u2019|\u00BB)", r"\\1", text)
    return text


def main() -> int:
    args = parse_args()
    in_dir = Path(args.input)
    out_path = Path(args.output)

    if not in_dir.is_dir():
        print(f"Input directory not found: {in_dir}", file=sys.stderr)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)

    xml_files = sorted(in_dir.rglob("*.ana.xml"))

    total_sentences = 0
    with out_path.open("w", encoding="utf-8") as out_f:
        for file_path in xml_files:
            category = file_path.parts[len(in_dir.parts)] if len(file_path.parts) > len(in_dir.parts) else "unknown"
            try:
                tree = ET.parse(file_path)
            except ET.ParseError as exc:
                print(f"Failed to parse {file_path}: {exc}", file=sys.stderr)
                continue

            root = tree.getroot()
            for s_index, s in enumerate(root.findall(".//tei:s", NS)):
                tokens = []
                surface_tokens: list[str] = []
                for child in list(s):
                    tag = child.tag
                    if tag.endswith("}w"):
                        form = (child.text or "").strip()
                        lemma = (child.attrib.get("lemma") or "").strip()
                        pos = (child.attrib.get("pos") or "").strip()
                        if not form or not lemma:
                            continue
                        surface_tokens.append(form)
                        tokens.append({
                            "form": form,
                            "lemma": lemma,
                            "pos": pos,
                        })
                    elif tag.endswith("}pc"):
                        punct = (child.text or "").strip()
                        if punct:
                            surface_tokens.append(punct)

                if not tokens:
                    continue

                sentence_text = build_sentence_text(surface_tokens)
                record = {
                    "docId": file_path.stem,
                    "category": category,
                    "sentenceIndex": s_index,
                    "text": sentence_text,
                    "tokens": tokens,
                }
                out_f.write(json.dumps(record, ensure_ascii=False) + "\n")

                total_sentences += 1
                if args.max_sentences and total_sentences >= args.max_sentences:
                    return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
