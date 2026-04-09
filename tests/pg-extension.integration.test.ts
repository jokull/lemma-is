import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { Client } from "pg";
import {
  BinaryLemmatizer,
  buildSearchQuery,
  extractIndexableLemmas,
} from "../src/index.js";

type Doc = { id: number; title: string; body: string };

describe("PostgreSQL extension integration (core)", () => {
  let lemmatizer: BinaryLemmatizer;
  let client: Client;
  const corpusSlice = [
    "Börnin fóru í bíó.",
    "Ég keypti hestinn.",
    "Við fórum í sund.",
    "Hún keypti epli og banana.",
  ].join(" ");

  beforeAll(async () => {
    const dataDir = join(import.meta.dirname, "..", "data-dist");
    const buffer = readFileSync(join(dataDir, "lemma-is.core.bin"));
    lemmatizer = BinaryLemmatizer.loadFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    execFileSync(join(import.meta.dirname, "..", "postgres", "test-extension.sh"), {
      stdio: "inherit",
    });

    client = new Client({
      host: "localhost",
      port: 5433,
      user: "postgres",
      password: "postgres",
      database: "postgres",
    });
    await client.connect();

    await client.query("DROP TABLE IF EXISTS documents;");
    await client.query(
      `CREATE TABLE documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        search_vector TSVECTOR
      );`
    );

    const docs: Omit<Doc, "id">[] = [
      {
        title: "Börn í bíó",
        body: "Börnin fóru í bíó.",
      },
      {
        title: "Hestar",
        body: "Ég keypti hestinn.",
      },
      {
        title: "Sundferð",
        body: "Við fórum í sund.",
      },
      {
        title: "Matarkaup",
        body: "Hún keypti epli og banana.",
      },
    ];

    for (const doc of docs) {
      await client.query(
        `INSERT INTO documents (title, body, search_vector)
         VALUES ($1, $2, icelandic_tsvector($1 || ' ' || $2));`,
        [doc.title, doc.body]
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  const search = async (text: string): Promise<string[]> => {
    const { query } = buildSearchQuery(text, lemmatizer, {
      removeStopwords: false,
    });
    const result = await client.query(
      `SELECT title FROM documents
       WHERE search_vector @@ to_tsquery('simple', $1)
       ORDER BY id;`,
      [query]
    );
    return result.rows.map((row) => row.title as string);
  };

  it("matches inflected forms via extension lemmatization", async () => {
    const results = await search("hestur");
    expect(results).toContain("Hestar");
  });

  it("matches plural/inflected forms with buildSearchQuery", async () => {
    const results = await search("börn");
    expect(results).toContain("Börn í bíó");
  });

  it("recalls multiple lemma candidates", async () => {
    const results = await search("fóru");
    expect(results).toContain("Börn í bíó");
    expect(results).toContain("Sundferð");
  });

  it("matches JS core lemmatizer lexemes for a corpus slice", async () => {
    const tokens = corpusSlice
      .toLowerCase()
      .match(/\p{L}+/gu)
      ?.filter(Boolean) ?? [];

    const uniqueTokens = Array.from(new Set(tokens)).slice(0, 200);
    const placeholders = uniqueTokens.map((_, i) => `$${i + 1}`).join(", ");

    const result = await client.query(
      `SELECT word, array_to_string(icelandic_lexize(word), '|') AS lexemes
       FROM unnest(ARRAY[${placeholders}]) AS word;`,
      uniqueTokens
    );

    for (const row of result.rows) {
      const word = row.word as string;
      const pgLexemes = row.lexemes ? (row.lexemes as string).split("|") : [];
      const jsLexemes = lemmatizer.lemmatize(word);
      expect(pgLexemes).toEqual(jsLexemes);
    }
  });

  it("matches extractIndexableLemmas for a corpus slice", async () => {
    const jsLemmas = Array.from(extractIndexableLemmas(corpusSlice, lemmatizer)).sort();
    const result = await client.query(
      "SELECT icelandic_fts_lemmas($1) AS lemmas;",
      [corpusSlice]
    );
    const pgLemmas = ((result.rows[0]?.lemmas as string[]) ?? []).slice().sort();
    expect(pgLemmas).toEqual(jsLemmas);
  });

  it("matches buildSearchQuery for a corpus slice", async () => {
    const { query: jsQuery } = buildSearchQuery(corpusSlice, lemmatizer);
    const result = await client.query(
      "SELECT icelandic_fts_query($1) AS query;",
      [corpusSlice]
    );
    const pgQuery = result.rows[0]?.query as string;
    expect(pgQuery).toEqual(jsQuery);
  });
});
