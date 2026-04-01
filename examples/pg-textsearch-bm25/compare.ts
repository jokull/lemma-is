/**
 * Compare pg_textsearch BM25 vs built-in ts_rank for Icelandic text search
 * using lemma-is for lemmatization.
 */

import { readFileSync } from "node:fs";
import pg from "pg";
import {
  BinaryLemmatizer,
  extractIndexableLemmas,
} from "../../dist/index.mjs";

const { Client } = pg;

// ── Load lemmatizer ──────────────────────────────────────────────────
const buf = readFileSync(
  new URL("../../data-dist/lemma-is.core.bin", import.meta.url)
);
const lemmatizer = BinaryLemmatizer.loadFromBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
);
console.log(
  `Lemmatizer loaded: ${lemmatizer.wordFormCount.toLocaleString()} word forms\n`
);

// ── Connect to Postgres ──────────────────────────────────────────────
const client = new Client({
  host: "localhost",
  port: 5433,
  database: "lemma_test",
  user: "test",
  password: "test",
});
await client.connect();

// ── Step 0: Create schema and insert data ────────────────────────────
console.log("=== Setting up database ===\n");

await client.query(`CREATE EXTENSION IF NOT EXISTS pg_textsearch`);
console.log("  pg_textsearch extension enabled");

await client.query(`
  CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tsv tsvector
  )
`);

const existing = await client.query("SELECT count(*) FROM documents");
if (Number(existing.rows[0].count) === 0) {
  await client.query(`
    INSERT INTO documents (title, body) VALUES
    ('Húsnæðismarkaður á Íslandi', 'Verð á fasteignum í Reykjavík hefur hækkað mikið á síðustu árum. Margir ungir einstaklingar eiga erfitt með að kaupa sína fyrstu íbúð. Húsnæðislánavextir hafa einnig hækkað og gera kaupin erfiðari. Ríkisstjórnin hefur boðað nýjar aðgerðir til að hjálpa ungu fólki inn á húsnæðismarkaðinn.'),
    ('Íslenskt sjávarútvegsfyrirtæki', 'Sjávarútvegur er ein af mikilvægustu atvinnugreinum Íslands. Útflutningur á fiski og sjávarafurðum skilar miklum gjaldeyristekjum. Þorskur, ýsa og loðna eru meðal helstu tegunda sem veiddar eru. Sjómenn vinna á erfiðum aðstæðum úti á sjó.'),
    ('Ferðamál og náttúra', 'Ferðaþjónustan er orðin ein stærsta atvinnugrein landsins. Túristar koma til að sjá jökla, gos og norðurljós. Þjóðgarðurinn á Þingvöllum er meðal vinsælustu áfangastaða. Náttúruvernd er mikilvæg til að vernda þessa auðlind fyrir komandi kynslóðir.'),
    ('Menntakerfi Íslands', 'Menntun er gjaldfrjáls á Íslandi frá grunnskóla til háskóla. Háskóli Íslands er stærsti háskólinn í landinu. Nemendur geta sótt um námslán hjá Menntasjóði. Kennaraskortur hefur verið vaxandi vandamál á síðustu árum.'),
    ('Veðurfar og loftslagsbreytingar', 'Veðrið á Íslandi er milt að vetrarlagi miðað við norðlæga legu. Golfstraumurinn heldur hitastigi hærra en ella. Loftslagsbreytingar hafa þó áhrif á jökla landsins sem hörfa hratt. Vísindamenn fylgjast grannt með breytingunum.'),
    ('Orkumál á Íslandi', 'Ísland nýtir endurnýjanlega orkugjafa nánast eingöngu. Vatnsafl og jarðvarmi veita rafmagn og hita til húsa. Álver nota mikla orku og eru stórir viðskiptavinir orkufyrirtækjanna. Hugmyndir um sæstreng til Evrópu hafa verið ræddar.'),
    ('Heilbrigðiskerfið', 'Landspítalinn er stærsti sjúkrahúsið á Íslandi. Heilbrigðisþjónusta er að mestu greidd af ríkinu. Biðlistar eftir aðgerðum hafa lengst. Skortur á hjúkrunarfræðingum og læknum er vaxandi vandamál.'),
    ('Íslensk bókmenntasaga', 'Íslendingasögurnar eru meðal merkustu bókmenntaverka vestrænnar menningar. Snorri Sturluson skrifaði Eddu og Heimskringlu á þrettándu öld. Halldór Laxness hlaut Nóbelsverðlaunin í bókmenntum árið 1955. Íslensk bókmenntahefð er löng og rík.'),
    ('Tölvuþróun og nýsköpun', 'Ísland er framsækið í stafrænni tækni og nýsköpun. Mörg sprotafyrirtæki hafa orðið til í tæknigeiranum. Gagnaveri hafa verið reist vegna kaldrar loftslags og ódýrrar orku. Kóðun er kennd í mörgum grunnskólum.'),
    ('Íþróttir á Íslandi', 'Knattspyrna er vinsælasta íþróttin á Íslandi. Ísland komst á Evrópumótið í knattspyrnu árið 2016. Handbolti er einnig mjög vinsæll. Glíma er þjóðaríþrótt Íslendinga og hefur verið stunduð í aldir.')
  `);
  console.log("  Inserted 10 Icelandic documents");
}

// ── Step 1: Update documents with lemmatized tsvectors ───────────────
console.log("\n=== Updating documents with lemmatized tsvectors ===\n");

const docs = await client.query("SELECT id, title, body FROM documents ORDER BY id");
for (const row of docs.rows) {
  const fullText = `${row.title} ${row.body}`;
  const lemmas = extractIndexableLemmas(fullText, lemmatizer, {
    removeStopwords: true,
  });
  // Build a tsvector from lemmas
  const lemmaArray = [...lemmas];
  if (lemmaArray.length === 0) continue;

  // Use to_tsvector('simple', ...) so Postgres doesn't re-stem
  const lemmaText = lemmaArray.join(" ");
  await client.query(
    `UPDATE documents SET tsv = to_tsvector('simple', $1) WHERE id = $2`,
    [lemmaText, row.id]
  );
  console.log(
    `  Doc ${row.id}: "${row.title}" → ${lemmaArray.length} lemmas`
  );
}

// ── Step 2: Create indexes ───────────────────────────────────────────
console.log("\n=== Creating indexes ===\n");

// GIN index for built-in ts_rank
await client.query(
  `CREATE INDEX IF NOT EXISTS idx_tsv ON documents USING gin(tsv)`
);
console.log("  Created GIN index on tsv column");

// BM25 index on the body column (raw text, using 'simple' config)
await client.query(
  `CREATE INDEX IF NOT EXISTS idx_bm25_body ON documents USING bm25(body) WITH (text_config='simple')`
);
console.log("  Created BM25 index on body column");

// Also create a text column with lemmatized content for BM25
await client.query(
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS lemma_text TEXT`
);
for (const row of docs.rows) {
  const fullText = `${row.title} ${row.body}`;
  const lemmas = extractIndexableLemmas(fullText, lemmatizer, {
    removeStopwords: true,
  });
  await client.query(
    `UPDATE documents SET lemma_text = $1 WHERE id = $2`,
    [[...lemmas].join(" "), row.id]
  );
}
await client.query(
  `CREATE INDEX IF NOT EXISTS idx_bm25_lemma ON documents USING bm25(lemma_text) WITH (text_config='simple')`
);
console.log("  Created BM25 index on lemma_text column");

// ── Step 3: Run comparison queries ───────────────────────────────────
console.log("\n=== Search Comparison ===\n");

interface Result {
  id: number;
  title: string;
  score: number;
}

const queries = [
  { label: "Housing / real estate", input: "húsnæði fasteignir" },
  { label: "Fishing industry", input: "sjávarútvegur fiskur" },
  { label: "Tourism nature", input: "ferðaþjónusta náttúra" },
  { label: "Education university", input: "menntun háskóli" },
  { label: "Climate glaciers", input: "loftslag jöklar" },
  { label: "Energy renewable", input: "orka endurnýjanleg" },
  { label: "Healthcare hospital", input: "heilbrigði sjúkrahús" },
  { label: "Literature sagas", input: "bókmenntir sögur" },
  { label: "Technology innovation", input: "tækni nýsköpun" },
  { label: "Sports football", input: "íþróttir knattspyrna" },
  // Cross-topic queries
  { label: "Young people buying", input: "ungt fólk kaup" },
  { label: "Shortage of workers", input: "skortur starfsfólk" },
];

for (const q of queries) {
  // Lemmatize the query
  const queryLemmas = extractIndexableLemmas(q.input, lemmatizer, {
    removeStopwords: true,
  });
  const lemmaList = [...queryLemmas];

  console.log(
    `Query: "${q.input}" → lemmas: [${lemmaList.join(", ")}]`
  );
  console.log(`  (${q.label})`);

  // ── ts_rank (built-in) with lemmatized tsvector ──
  const tsQuery = lemmaList.map((l) => `'${l}'`).join(" | ");
  const tsRankSQL = `
    SELECT id, title,
           ts_rank(tsv, to_tsquery('simple', $1)) AS score
    FROM documents
    WHERE tsv @@ to_tsquery('simple', $1)
    ORDER BY score DESC
    LIMIT 5
  `;
  const tsRankQuery = lemmaList.join(" | ");
  const tsRankResult = await client.query<Result>(tsRankSQL, [tsRankQuery]);

  // ── BM25 on raw text ──
  const bm25RawSQL = `
    SELECT id, title,
           body <@> to_bm25query($1, 'idx_bm25_body') AS score
    FROM documents
    ORDER BY body <@> to_bm25query($1, 'idx_bm25_body')
    LIMIT 5
  `;
  let bm25RawResult: pg.QueryResult<Result>;
  try {
    bm25RawResult = await client.query<Result>(bm25RawSQL, [q.input]);
  } catch (e: any) {
    console.error(`    BM25 raw error: ${e.message}`);
    bm25RawResult = { rows: [], rowCount: 0 } as any;
  }

  // ── BM25 on lemmatized text ──
  const bm25LemmaSQL = `
    SELECT id, title,
           lemma_text <@> to_bm25query($1, 'idx_bm25_lemma') AS score
    FROM documents
    ORDER BY lemma_text <@> to_bm25query($1, 'idx_bm25_lemma')
    LIMIT 5
  `;
  const bm25LemmaQuery = lemmaList.join(" ");
  let bm25LemmaResult: pg.QueryResult<Result>;
  try {
    bm25LemmaResult = await client.query<Result>(bm25LemmaSQL, [
      bm25LemmaQuery,
    ]);
  } catch (e: any) {
    console.error(`    BM25 lemma error: ${e.message}`);
    bm25LemmaResult = { rows: [], rowCount: 0 } as any;
  }

  // ── Display results side by side ──
  console.log(
    "\n  ┌─────────────────────────────────────┬─────────────────────────────────────┬─────────────────────────────────────┐"
  );
  console.log(
    "  │ ts_rank (lemmatized tsvector)        │ BM25 (raw Icelandic text)           │ BM25 (lemmatized text)              │"
  );
  console.log(
    "  ├─────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤"
  );

  const maxRows = Math.max(
    tsRankResult.rows.length,
    bm25RawResult.rows.length,
    bm25LemmaResult.rows.length
  );

  for (let i = 0; i < Math.max(maxRows, 1); i++) {
    const fmt = (r: Result | undefined) => {
      if (!r) return "".padEnd(35);
      const score =
        r.score < 0
          ? (-r.score).toFixed(4)
          : r.score.toFixed(4);
      const title = r.title.slice(0, 22).padEnd(22);
      return `${(i + 1)}. ${title} ${score}`.padEnd(35);
    };

    const col1 = fmt(tsRankResult.rows[i]);
    const col2 = fmt(bm25RawResult.rows[i]);
    const col3 = fmt(bm25LemmaResult.rows[i]);
    console.log(`  │ ${col1} │ ${col2} │ ${col3} │`);
  }
  console.log(
    "  └─────────────────────────────────────┴─────────────────────────────────────┴─────────────────────────────────────┘"
  );
  console.log();
}

await client.end();
console.log("Done.");
