CREATE FUNCTION icelandic_lexize(text)
RETURNS text[]
AS 'MODULE_PATHNAME', 'icelandic_lexize'
LANGUAGE C IMMUTABLE STRICT;

CREATE FUNCTION icelandic_fts_lemmas(text)
RETURNS text[]
AS 'MODULE_PATHNAME', 'icelandic_fts_lemmas'
LANGUAGE C IMMUTABLE STRICT;

CREATE FUNCTION icelandic_fts_query(text)
RETURNS text
AS 'MODULE_PATHNAME', 'icelandic_fts_query'
LANGUAGE C IMMUTABLE STRICT;

CREATE FUNCTION icelandic_tsvector(doc text)
RETURNS tsvector
LANGUAGE SQL IMMUTABLE STRICT
AS $$
  SELECT to_tsvector('simple', coalesce(string_agg(lexeme, ' '), ''))
  FROM (
    SELECT unnest(icelandic_lexize(token)) AS lexeme
    FROM ts_parse('default', doc) AS t(tokid, token)
    WHERE token IS NOT NULL AND token <> ''
  ) s;
$$;
