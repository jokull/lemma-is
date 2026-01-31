#!/usr/bin/env python3
"""Parse IFD TEI XML into JSONL sentences with gold lemmas/POS.

Usage:
  python3 scripts/benchmark/ifd/parse_ifd.py --input /Users/jokull/Downloads/IFD_2 --output data/ifd/ifd.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import os
import sys
import xml.etree.ElementTree as ET

TEI_NS = "http://www.tei-c.org/ns/1.0"
NS = {"tei": TEI_NS}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="IFD_2 directory with XML files")
    parser.add_argument("--output", required=True, help="Output JSONL path")
    return parser.parse_args()


def get_text_class(root: ET.Element) -> str | None:
    node = root.find(".//tei:profileDesc/tei:textClass/tei:classCode", NS)
    if node is None:
        return None
    return (node.text or "").strip() or None


def iter_sentences(root: ET.Element):
    for s in root.findall(".//tei:s", NS):
        yield s


def build_sentence_text(tokens: list[str]) -> str:
    text = " ".join(tokens)
    # Remove spaces before common punctuation
    text = re.sub(r"\s+([,.;:!?])", r"\\1", text)
    text = re.sub(r"\s+([\\)\\]\\}])", r"\\1", text)
    # Remove spaces after opening brackets/quotes
    text = re.sub(r"([\\(\\[\\{])\\s+", r"\\1", text)
    text = re.sub(r"(\\u201E|\\u201C|\\u2018|\\u00AB)\\s+", r"\\1", text)
    # Remove spaces before closing quotes
    text = re.sub(r"\\s+(\\u201D|\\u2019|\\u00BB)", r"\\1", text)
    return text


def main() -> int:
    args = parse_args()
    in_dir = args.input
    out_path = args.output

    if not os.path.isdir(in_dir):
        print(f"Input directory not found: {in_dir}", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    files = [f for f in os.listdir(in_dir) if f.endswith(".xml") and f != "otbHdr.xml"]
    files.sort()

    with open(out_path, "w", encoding="utf-8") as out_f:
        for filename in files:
            file_path = os.path.join(in_dir, filename)
            try:
                tree = ET.parse(file_path)
            except ET.ParseError as exc:
                print(f"Failed to parse {file_path}: {exc}", file=sys.stderr)
                continue

            root = tree.getroot()
            text_class = get_text_class(root)

            for s_index, s in enumerate(iter_sentences(root)):
                tokens = []
                surface_tokens: list[str] = []
                for child in list(s):
                    tag = child.tag
                    if tag.endswith("}w"):
                        form = (child.text or "").strip()
                        lemma = (child.attrib.get("lemma") or "").strip()
                        pos = (child.attrib.get("type") or "").strip()
                        if not form or not lemma:
                            continue
                        surface_tokens.append(form)
                        tokens.append({
                            "form": form,
                            "lemma": lemma,
                            "pos": pos,
                        })
                    elif tag.endswith("}c"):
                        punct = (child.text or "").strip()
                        if punct:
                            surface_tokens.append(punct)

                if not tokens:
                    continue

                sentence_text = build_sentence_text(surface_tokens)
                record = {
                    "docId": os.path.splitext(filename)[0],
                    "category": text_class,
                    "sentenceIndex": s_index,
                    "text": sentence_text,
                    "tokens": tokens,
                }
                out_f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
