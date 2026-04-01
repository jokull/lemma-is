# pg_textsearch BM25 vs ts_rank comparison

Compares three Postgres full-text search approaches for Icelandic text:

1. **ts_rank + lemma-is** — lemmatized tsvectors with built-in `ts_rank`
2. **BM25 raw** — [pg_textsearch](https://github.com/timescale/pg_textsearch) on raw Icelandic text
3. **BM25 + lemma-is** — pg_textsearch on pre-lemmatized text

## Run

```bash
# Start Postgres 17 with pg_textsearch (builds from source)
docker compose up -d

# Install deps and run comparison
pnpm install
pnpm build
npx tsx examples/pg-textsearch-bm25/compare.ts

# Cleanup
docker compose down -v
```

## Results

BM25 on raw Icelandic text matched only 2/12 queries — inflection makes exact token matching nearly useless. BM25 + lemma-is matched 10/12 and produced better score differentiation than ts_rank (e.g., `1.97 > 1.70 > 1.55` vs flat `0.0304` for three docs).

Lemmatization is essential for Icelandic full-text search regardless of ranking algorithm.
