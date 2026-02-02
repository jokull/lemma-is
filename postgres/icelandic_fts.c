#include "postgres.h"
#include "fmgr.h"
#include "miscadmin.h"
#include "catalog/pg_type_d.h"
#include "mb/pg_wchar.h"
#include "tsearch/ts_locale.h"
#include "utils/array.h"
#include "utils/builtins.h"
#include "utils/hsearch.h"
#include "utils/lsyscache.h"
#include "utils/memutils.h"
#include "utils/varlena.h"
#include "storage/fd.h"
#include "port/pg_bswap.h"
#include "utils/errcodes.h"
#include <unicode/uchar.h>
#include <math.h>

#include "icelandic_fts_data.h"

PG_MODULE_MAGIC;

#ifdef WORDS_BIGENDIAN
#define LEMMA_IS_LE32(x) pg_bswap32(x)
#else
#define LEMMA_IS_LE32(x) (x)
#endif
typedef struct LemmaIsBinary
{
	char *data;
	Size size;

	uint32 version;
	uint32 stringPoolSize;
	uint32 lemmaCount;
	uint32 wordCount;
	uint32 entryCount;
	uint32 bigramCount;

	const uint8 *stringPool;
	const uint32 *lemmaOffsets;
	const uint8 *lemmaLengths;
	const uint32 *wordOffsets;
	const uint8 *wordLengths;
	const uint32 *entryOffsets;
	const uint32 *entries;
	const uint32 *bigramW1Offsets;
	const uint8 *bigramW1Lengths;
	const uint32 *bigramW2Offsets;
	const uint8 *bigramW2Lengths;
	const uint32 *bigramFreqs;
} LemmaIsBinary;

typedef struct LemmaIsEntry
{
	uint32 lemmaIdx;
	uint8 posCode;
	uint8 caseCode;
	uint8 genderCode;
	uint8 numberCode;
} LemmaIsEntry;

typedef struct LemmaCandidate
{
	char *lemma;
	IcelandicPos pos;
	uint8 caseCode;
	uint8 genderCode;
	uint8 numberCode;
} LemmaCandidate;

static LemmaIsBinary *lemma_is_bin = NULL;

PG_FUNCTION_INFO_V1(icelandic_lexize);
PG_FUNCTION_INFO_V1(icelandic_fts_lemmas);
PG_FUNCTION_INFO_V1(icelandic_fts_query);

static uint32
lemma_is_u32(const uint32 *ptr, uint32 idx)
{
	return LEMMA_IS_LE32(ptr[idx]);
}

static char *
lemma_is_get_lemma(const LemmaIsBinary *bin, uint32 idx)
{
	uint32 offset = lemma_is_u32(bin->lemmaOffsets, idx);
	uint8 len = bin->lemmaLengths[idx];
	const char *base = (const char *) (bin->stringPool + offset);
	return pnstrdup(base, len);
}

static int
lemma_is_compare_word(const LemmaIsBinary *bin, uint32 idx, const char *word, int word_len)
{
	uint32 offset = lemma_is_u32(bin->wordOffsets, idx);
	uint8 len = bin->wordLengths[idx];
	const uint8 *entry = bin->stringPool + offset;
	int minlen = word_len < len ? word_len : len;
	int cmp = memcmp(entry, word, minlen);

	if (cmp == 0)
		return (int) len - word_len;

	return cmp;
}

static int
lemma_is_find_word(const LemmaIsBinary *bin, const char *word)
{
	int left = 0;
	int right = (int) bin->wordCount - 1;
	int word_len = (int) strlen(word);

	while (left <= right)
	{
		int mid = (left + right) >> 1;
		int cmp = lemma_is_compare_word(bin, (uint32) mid, word, word_len);

		if (cmp == 0)
			return mid;
		if (cmp < 0)
			left = mid + 1;
		else
			right = mid - 1;
	}

	return -1;
}

static int
lemma_is_compare_bigram(
	const LemmaIsBinary *bin,
	uint32 idx,
	const char *word1,
	int word1_len,
	const char *word2,
	int word2_len)
{
	uint32 w1_offset = lemma_is_u32(bin->bigramW1Offsets, idx);
	uint8 w1_len = bin->bigramW1Lengths[idx];
	const uint8 *w1_entry = bin->stringPool + w1_offset;
	int minlen1 = word1_len < w1_len ? word1_len : w1_len;
	int cmp = memcmp(w1_entry, word1, minlen1);

	if (cmp == 0)
	{
		cmp = (int) w1_len - word1_len;
		if (cmp == 0)
		{
			uint32 w2_offset = lemma_is_u32(bin->bigramW2Offsets, idx);
			uint8 w2_len = bin->bigramW2Lengths[idx];
			const uint8 *w2_entry = bin->stringPool + w2_offset;
			int minlen2 = word2_len < w2_len ? word2_len : w2_len;
			cmp = memcmp(w2_entry, word2, minlen2);
			if (cmp == 0)
				cmp = (int) w2_len - word2_len;
		}
	}

	return cmp;
}

static int
lemma_is_find_bigram(const LemmaIsBinary *bin, const char *word1, const char *word2)
{
	int left = 0;
	int right = (int) bin->bigramCount - 1;
	int w1_len = (int) strlen(word1);
	int w2_len = (int) strlen(word2);

	if (bin->bigramCount == 0)
		return -1;

	while (left <= right)
	{
		int mid = (left + right) >> 1;
		int cmp = lemma_is_compare_bigram(bin, (uint32) mid, word1, w1_len, word2, w2_len);

		if (cmp == 0)
			return mid;
		if (cmp < 0)
			left = mid + 1;
		else
			right = mid - 1;
	}

	return -1;
}

static uint32
lemma_is_bigram_freq(const LemmaIsBinary *bin, const char *word1, const char *word2)
{
	int idx = lemma_is_find_bigram(bin, word1, word2);
	if (idx < 0)
		return 0;
	return lemma_is_u32(bin->bigramFreqs, (uint32) idx);
}

static LemmaIsBinary *
lemma_is_load_binary(const char *datafile)
{
	char path[MAXPGPATH];
	FILE *fp;
	Size size;
	LemmaIsBinary *bin;
	uint8 *data;
	uint32 magic;
	uint32 version;
	uint32 stringPoolSize;
	uint32 lemmaCount;
	uint32 wordCount;
	uint32 entryCount;
	uint32 bigramCount;
	Size offset;

	if (datafile == NULL || datafile[0] == '\0')
		datafile = "icelandic_fts.core.bin";

	if (strchr(datafile, '/'))
	{
		strlcpy(path, datafile, sizeof(path));
	}
	else
	{
		char sharepath[MAXPGPATH];
		get_share_path(my_exec_path, sharepath);
		snprintf(path, sizeof(path), "%s/extension/%s", sharepath, datafile);
	}

	fp = AllocateFile(path, "rb");
	if (fp == NULL)
		ereport(ERROR,
				(errcode(ERRCODE_UNDEFINED_FILE),
				 errmsg("icelandic: could not open data file \"%s\": %m", path)));

	if (fseek(fp, 0, SEEK_END) != 0)
		ereport(ERROR,
				(errcode(ERRCODE_UNDEFINED_FILE),
				 errmsg("icelandic: could not seek data file \"%s\": %m", path)));

	size = (Size) ftell(fp);
	if (size <= 0)
		ereport(ERROR,
				(errcode(ERRCODE_UNDEFINED_FILE),
				 errmsg("icelandic: could not read data file \"%s\": %m", path)));
	rewind(fp);

	data = (uint8 *) palloc(size);
	if (fread(data, 1, size, fp) != size)
	{
		FreeFile(fp);
		ereport(ERROR,
				(errcode(ERRCODE_UNDEFINED_FILE),
				 errmsg("icelandic: could not read data file \"%s\": %m", path)));
	}
	FreeFile(fp);

	magic = LEMMA_IS_LE32(*((uint32 *) data));
	if (magic != 0x4C454D41)
		ereport(ERROR,
				(errcode(ERRCODE_DATA_EXCEPTION),
				 errmsg("icelandic: invalid binary format (bad magic)")));

	version = LEMMA_IS_LE32(*((uint32 *) (data + 4)));
	if (version != 1 && version != 2)
		ereport(ERROR,
				(errcode(ERRCODE_DATA_EXCEPTION),
				 errmsg("icelandic: unsupported binary version %u", version)));

	stringPoolSize = LEMMA_IS_LE32(*((uint32 *) (data + 8)));
	lemmaCount = LEMMA_IS_LE32(*((uint32 *) (data + 12)));
	wordCount = LEMMA_IS_LE32(*((uint32 *) (data + 16)));
	entryCount = LEMMA_IS_LE32(*((uint32 *) (data + 20)));
	bigramCount = LEMMA_IS_LE32(*((uint32 *) (data + 24)));

	offset = 32;
	if (offset + stringPoolSize > size)
		ereport(ERROR,
				(errcode(ERRCODE_DATA_EXCEPTION),
				 errmsg("icelandic: corrupted binary (string pool out of bounds)")));

	bin = (LemmaIsBinary *) palloc0(sizeof(LemmaIsBinary));
	bin->data = (char *) data;
	bin->size = size;
	bin->version = version;
	bin->stringPoolSize = stringPoolSize;
	bin->lemmaCount = lemmaCount;
	bin->wordCount = wordCount;
	bin->entryCount = entryCount;
	bin->bigramCount = bigramCount;

	bin->stringPool = data + offset;
	offset += stringPoolSize;

	bin->lemmaOffsets = (const uint32 *) (data + offset);
	offset += (Size) lemmaCount * 4;
	bin->lemmaLengths = (const uint8 *) (data + offset);
	offset += (Size) lemmaCount;
	offset = (offset + 3) & ~3;

	bin->wordOffsets = (const uint32 *) (data + offset);
	offset += (Size) wordCount * 4;
	bin->wordLengths = (const uint8 *) (data + offset);
	offset += (Size) wordCount;
	offset = (offset + 3) & ~3;

	bin->entryOffsets = (const uint32 *) (data + offset);
	offset += (Size) (wordCount + 1) * 4;
	bin->entries = (const uint32 *) (data + offset);

	if (offset + (Size) entryCount * 4 > size)
		ereport(ERROR,
				(errcode(ERRCODE_DATA_EXCEPTION),
				 errmsg("icelandic: corrupted binary (entries out of bounds)")));

	offset += (Size) entryCount * 4;
	offset = (offset + 3) & ~3;

	if (bigramCount > 0)
	{
		bin->bigramW1Offsets = (const uint32 *) (data + offset);
		offset += (Size) bigramCount * 4;

		bin->bigramW1Lengths = (const uint8 *) (data + offset);
		offset += (Size) bigramCount;
		offset = (offset + 3) & ~3;

		bin->bigramW2Offsets = (const uint32 *) (data + offset);
		offset += (Size) bigramCount * 4;

		bin->bigramW2Lengths = (const uint8 *) (data + offset);
		offset += (Size) bigramCount;
		offset = (offset + 3) & ~3;

		bin->bigramFreqs = (const uint32 *) (data + offset);
		offset += (Size) bigramCount * 4;

		if (offset > size)
			ereport(ERROR,
					(errcode(ERRCODE_DATA_EXCEPTION),
					 errmsg("icelandic: corrupted binary (bigrams out of bounds)")));
	}

	return bin;
}

static LemmaIsEntry
lemma_is_unpack_entry(const LemmaIsBinary *bin, uint32 packed)
{
	LemmaIsEntry entry;

	if (bin->version == 1)
	{
		entry.lemmaIdx = packed >> 4;
		entry.posCode = packed & 0xF;
		entry.caseCode = 0;
		entry.genderCode = 0;
		entry.numberCode = 0;
		return entry;
	}

	entry.lemmaIdx = packed >> 10;
	entry.posCode = packed & 0xF;
	entry.caseCode = (packed >> 4) & 0x7;
	entry.genderCode = (packed >> 7) & 0x3;
	entry.numberCode = (packed >> 9) & 0x1;
	return entry;
}

static IcelandicPos
lemma_is_pos_from_code(uint8 code)
{
	switch (code)
	{
		case 0:
			return POS_NO;
		case 1:
			return POS_SO;
		case 2:
			return POS_LO;
		case 3:
			return POS_AO;
		case 4:
			return POS_FS;
		case 5:
			return POS_FN;
		case 6:
			return POS_ST;
		case 7:
			return POS_TO;
		case 8:
			return POS_GR;
		case 9:
			return POS_UH;
		default:
			return POS_NO;
	}
}

static int
compare_stopword(const void *key, const void *elem)
{
	const char *word = (const char *) key;
	const StopwordEntry *entry = (const StopwordEntry *) elem;
	return strcmp(word, entry->word);
}

static int
compare_contextual_stopword(const void *key, const void *elem)
{
	const char *word = (const char *) key;
	const ContextualStopwordEntry *entry = (const ContextualStopwordEntry *) elem;
	return strcmp(word, entry->word);
}

static int
compare_prep_case(const void *key, const void *elem)
{
	const char *word = (const char *) key;
	const PrepositionCaseEntry *entry = (const PrepositionCaseEntry *) elem;
	return strcmp(word, entry->prep);
}

static bool
lemma_is_stopword_simple(const char *lemma)
{
	if (ICELANDIC_STOPWORDS_COUNT == 0)
		return false;
	return bsearch(lemma, ICELANDIC_STOPWORDS, ICELANDIC_STOPWORDS_COUNT,
				   sizeof(StopwordEntry), compare_stopword) != NULL;
}

static bool
lemma_is_contextual_stopword(const char *lemma, IcelandicPos pos)
{
	const ContextualStopwordEntry *entry;
	uint16_t pos_mask;

	if (ICELANDIC_CONTEXTUAL_STOPWORDS_COUNT == 0)
		return lemma_is_stopword_simple(lemma);

	entry = bsearch(lemma, ICELANDIC_CONTEXTUAL_STOPWORDS,
					ICELANDIC_CONTEXTUAL_STOPWORDS_COUNT,
					sizeof(ContextualStopwordEntry), compare_contextual_stopword);

	if (!entry)
		return lemma_is_stopword_simple(lemma);

	pos_mask = entry->pos_mask;
	return (pos_mask & (1 << pos)) != 0;
}

static bool
lemma_is_disambiguate_bigram(
	LemmaCandidate *candidates,
	int count,
	LemmaCandidate *prev_candidates,
	int prev_count,
	LemmaCandidate *next_candidates,
	int next_count,
	const char **out_lemma,
	IcelandicPos *out_pos,
	double *out_confidence,
	bool *out_by_bigram)
{
	int i;
	double best_score = 0.0;
	int best_idx = 0;
	double *scores;
	bool by_bigram = false;
	double confidence = 0.0;

	if (count <= 0)
		return false;

	scores = (double *) palloc(sizeof(double) * count);

	for (i = 0; i < count; i++)
	{
		double score = 0.0;
		int j;

		if (prev_candidates && prev_count > 0)
		{
			for (j = 0; j < prev_count; j++)
			{
				uint32 freq = lemma_is_bigram_freq(lemma_is_bin, prev_candidates[j].lemma, candidates[i].lemma);
				if (freq > 0)
					score += log((double) freq + 1.0);
			}
		}

		if (next_candidates && next_count > 0)
		{
			for (j = 0; j < next_count; j++)
			{
				uint32 freq = lemma_is_bigram_freq(lemma_is_bin, candidates[i].lemma, next_candidates[j].lemma);
				if (freq > 0)
					score += log((double) freq + 1.0);
			}
		}

		scores[i] = score;

		if (score > best_score)
		{
			best_score = score;
			best_idx = i;
		}
	}

	if (best_score > 0.0)
	{
		double total = 0.0;
		for (i = 0; i < count; i++)
			total += exp(scores[i]);
		confidence = total > 0.0 ? exp(best_score) / total : 0.5;
		by_bigram = true;
	}

	if (out_lemma)
		*out_lemma = candidates[best_idx].lemma;
	if (out_pos)
		*out_pos = candidates[best_idx].pos;
	if (out_confidence)
		*out_confidence = confidence;
	if (out_by_bigram)
		*out_by_bigram = by_bigram;

	return true;
}

static LemmaCandidate *
lemma_is_get_candidates(const LemmaIsBinary *bin, const char *word, int *out_count)
{
	int idx;
	uint32 start;
	uint32 end;
	int i;
	int count = 0;
	LemmaCandidate *candidates;
	char *lower;

	lower = lowerstr(pstrdup(word));
	idx = lemma_is_find_word(bin, lower);

	if (idx < 0)
	{
		candidates = (LemmaCandidate *) palloc(sizeof(LemmaCandidate));
		candidates[0].lemma = lower;
		candidates[0].pos = POS_NO;
		candidates[0].caseCode = 0;
		candidates[0].genderCode = 0;
		candidates[0].numberCode = 0;
		*out_count = 1;
		return candidates;
	}

	start = lemma_is_u32(bin->entryOffsets, (uint32) idx);
	end = lemma_is_u32(bin->entryOffsets, (uint32) idx + 1);
	if (end < start)
	{
		*out_count = 0;
		return NULL;
	}

	candidates = (LemmaCandidate *) palloc0(sizeof(LemmaCandidate) * (end - start));

	for (i = (int) start; i < (int) end; i++)
	{
		uint32 packed = lemma_is_u32(bin->entries, (uint32) i);
		LemmaIsEntry entry = lemma_is_unpack_entry(bin, packed);
		IcelandicPos pos = lemma_is_pos_from_code(entry.posCode);
		char *lemma = lemma_is_get_lemma(bin, entry.lemmaIdx);
		int j;
		bool seen = false;

		for (j = 0; j < count; j++)
		{
			if (candidates[j].pos == pos && strcmp(candidates[j].lemma, lemma) == 0)
			{
				seen = true;
				break;
			}
		}

		if (!seen)
		{
			candidates[count].lemma = lemma;
			candidates[count].pos = pos;
			candidates[count].caseCode = entry.caseCode;
			candidates[count].genderCode = entry.genderCode;
			candidates[count].numberCode = entry.numberCode;
			count++;
		}
	}

	if (count == 0)
	{
		candidates = (LemmaCandidate *) palloc(sizeof(LemmaCandidate));
		candidates[0].lemma = lower;
		candidates[0].pos = POS_NO;
		candidates[0].caseCode = 0;
		candidates[0].genderCode = 0;
		candidates[0].numberCode = 0;
		*out_count = 1;
		return candidates;
	}

	*out_count = count;
	return candidates;
}

typedef struct WordToken
{
	char *text;
} WordToken;

typedef struct TokenCandidates
{
	char *token;
	LemmaCandidate *candidates;
	int count;
} TokenCandidates;

static bool
icelandic_is_alpha(pg_wchar wc)
{
	return u_isalpha((UChar32) wc);
}

static bool
icelandic_is_word_joiner(pg_wchar wc)
{
	return wc == 0x27 || wc == 0x2019 || wc == 0x2D || wc == 0x2013 || wc == 0x2014;
}

static WordToken *
icelandic_tokenize_words(const char *input, int len, int *out_count)
{
	int capacity = 32;
	int count = 0;
	int offset = 0;
	WordToken *tokens = (WordToken *) palloc(sizeof(WordToken) * capacity);

	while (offset < len)
	{
		const unsigned char *ptr = (const unsigned char *) input + offset;
		int mblen = pg_mblen((const char *) ptr);
		pg_wchar wc = utf8_to_unicode(ptr);

		if (icelandic_is_alpha(wc))
		{
			int start = offset;
			offset += mblen;

			while (offset < len)
			{
				const unsigned char *next_ptr = (const unsigned char *) input + offset;
				int next_len = pg_mblen((const char *) next_ptr);
				pg_wchar next_wc = utf8_to_unicode(next_ptr);

				if (icelandic_is_alpha(next_wc))
				{
					offset += next_len;
					continue;
				}

				if (icelandic_is_word_joiner(next_wc))
				{
					int after_offset = offset + next_len;
					if (after_offset < len)
					{
						const unsigned char *after_ptr = (const unsigned char *) input + after_offset;
						int after_len = pg_mblen((const char *) after_ptr);
						pg_wchar after_wc = utf8_to_unicode(after_ptr);
						if (icelandic_is_alpha(after_wc))
						{
							offset += next_len;
							continue;
						}
					}
				}

				break;
			}

			if (count >= capacity)
			{
				capacity *= 2;
				tokens = (WordToken *) repalloc(tokens, sizeof(WordToken) * capacity);
			}

			tokens[count].text = pnstrdup(input + start, offset - start);
			count++;
			continue;
		}

		offset += mblen;
	}

	*out_count = count;
	return tokens;
}

Datum
icelandic_lexize(PG_FUNCTION_ARGS)
{
	text *input = PG_GETARG_TEXT_PP(0);
	char *txt;
	int idx;
	uint32 start;
	uint32 end;
	int i;
	int count = 0;
	uint32 *lemmaIds;
	Datum *elems;
	ArrayType *array;
	int16 typlen;
	bool typbyval;
	char typalign;

	if (lemma_is_bin == NULL)
	{
		MemoryContext oldctx = MemoryContextSwitchTo(TopMemoryContext);
		lemma_is_bin = lemma_is_load_binary(NULL);
		MemoryContextSwitchTo(oldctx);
	}

	get_typlenbyvalalign(TEXTOID, &typlen, &typbyval, &typalign);

	txt = text_to_cstring(input);
	txt = lowerstr(txt);

	idx = lemma_is_find_word(lemma_is_bin, txt);
	if (idx < 0)
	{
		elems = (Datum *) palloc(sizeof(Datum));
		elems[0] = CStringGetTextDatum(txt);
		array = construct_array(elems, 1, TEXTOID, typlen, typbyval, typalign);
		PG_RETURN_ARRAYTYPE_P(array);
	}

	start = lemma_is_u32(lemma_is_bin->entryOffsets, (uint32) idx);
	end = lemma_is_u32(lemma_is_bin->entryOffsets, (uint32) idx + 1);
	if (end < start)
		PG_RETURN_NULL();

	lemmaIds = (uint32 *) palloc0(sizeof(uint32) * (end - start));

	for (i = (int) start; i < (int) end; i++)
	{
		uint32 packed = lemma_is_u32(lemma_is_bin->entries, (uint32) i);
		LemmaIsEntry entry;
		int j;
		bool seen = false;

		entry = lemma_is_unpack_entry(lemma_is_bin, packed);

		for (j = 0; j < count; j++)
		{
			if (lemmaIds[j] == entry.lemmaIdx)
			{
				seen = true;
				break;
			}
		}

		if (!seen)
		{
			lemmaIds[count] = entry.lemmaIdx;
			count++;
		}
	}

	if (count == 0)
	{
		elems = (Datum *) palloc(sizeof(Datum));
		elems[0] = CStringGetTextDatum(txt);
		array = construct_array(elems, 1, TEXTOID, typlen, typbyval, typalign);
		PG_RETURN_ARRAYTYPE_P(array);
	}

	elems = (Datum *) palloc(sizeof(Datum) * count);
	for (i = 0; i < count; i++)
	{
		char *lemma = lemma_is_get_lemma(lemma_is_bin, lemmaIds[i]);
		elems[i] = CStringGetTextDatum(lemma);
	}

	array = construct_array(elems, count, TEXTOID, typlen, typbyval, typalign);
	PG_RETURN_ARRAYTYPE_P(array);
}

Datum
icelandic_fts_lemmas(PG_FUNCTION_ARGS)
{
	text *input = PG_GETARG_TEXT_PP(0);
	char *txt = text_to_cstring(input);
	int token_count = 0;
	WordToken *tokens;
	TokenCandidates *token_data;
	char **lemmas = NULL;
	int lemma_count = 0;
	int lemma_capacity = 64;
	int16 typlen;
	bool typbyval;
	char typalign;
	Datum *elems;
	ArrayType *array;
	int i;

	if (lemma_is_bin == NULL)
	{
		MemoryContext oldctx = MemoryContextSwitchTo(TopMemoryContext);
		lemma_is_bin = lemma_is_load_binary(NULL);
		MemoryContextSwitchTo(oldctx);
	}

	get_typlenbyvalalign(TEXTOID, &typlen, &typbyval, &typalign);

	lemmas = (char **) palloc(sizeof(char *) * lemma_capacity);
	tokens = icelandic_tokenize_words(txt, (int) strlen(txt), &token_count);
	token_data = (TokenCandidates *) palloc(sizeof(TokenCandidates) * token_count);

	for (i = 0; i < token_count; i++)
	{
		int candidate_count = 0;
		LemmaCandidate *candidates = lemma_is_get_candidates(lemma_is_bin, tokens[i].text, &candidate_count);
		token_data[i].token = tokens[i].text;
		token_data[i].candidates = candidates;
		token_data[i].count = candidate_count;
	}

	for (i = 0; i < token_count; i++)
	{
		int candidate_count = token_data[i].count;
		LemmaCandidate *candidates = token_data[i].candidates;
		char **token_lemmas = (char **) palloc(sizeof(char *) * candidate_count);
		int token_lemma_count = 0;
		const char *disambig_lemma = NULL;
		IcelandicPos disambig_pos = POS_NO;
		bool disambig_by_bigram = false;
		bool filter_disambiguated = false;
		int j;

		lemma_is_disambiguate_bigram(
			candidates,
			candidate_count,
			i > 0 ? token_data[i - 1].candidates : NULL,
			i > 0 ? token_data[i - 1].count : 0,
			i + 1 < token_count ? token_data[i + 1].candidates : NULL,
			i + 1 < token_count ? token_data[i + 1].count : 0,
			&disambig_lemma,
			&disambig_pos,
			NULL,
			&disambig_by_bigram);

		if (disambig_by_bigram && disambig_lemma)
			filter_disambiguated = lemma_is_contextual_stopword(disambig_lemma, disambig_pos);

		for (j = 0; j < candidate_count; j++)
		{
			const char *lemma = candidates[j].lemma;
			bool seen = false;
			int k;

			for (k = 0; k < token_lemma_count; k++)
			{
				if (strcmp(token_lemmas[k], lemma) == 0)
				{
					seen = true;
					break;
				}
			}

			if (seen)
				continue;

			if (filter_disambiguated && disambig_lemma && strcmp(lemma, disambig_lemma) == 0)
				continue;

			token_lemmas[token_lemma_count++] = candidates[j].lemma;
		}

		for (j = 0; j < token_lemma_count; j++)
		{
			bool seen = false;
			int k;

			for (k = 0; k < lemma_count; k++)
			{
				if (strcmp(lemmas[k], token_lemmas[j]) == 0)
				{
					seen = true;
					break;
				}
			}

			if (seen)
				continue;

			if (lemma_count >= lemma_capacity)
			{
				lemma_capacity *= 2;
				lemmas = (char **) repalloc(lemmas, sizeof(char *) * lemma_capacity);
			}

			lemmas[lemma_count++] = token_lemmas[j];
		}
	}

	if (lemma_count == 0)
		PG_RETURN_NULL();

	elems = (Datum *) palloc(sizeof(Datum) * lemma_count);
	for (i = 0; i < lemma_count; i++)
		elems[i] = CStringGetTextDatum(lemmas[i]);

	array = construct_array(elems, lemma_count, TEXTOID, typlen, typbyval, typalign);
	PG_RETURN_ARRAYTYPE_P(array);
}

Datum
icelandic_fts_query(PG_FUNCTION_ARGS)
{
	text *input = PG_GETARG_TEXT_PP(0);
	char *txt = text_to_cstring(input);
	int token_count = 0;
	WordToken *tokens;
	TokenCandidates *token_data;
	StringInfoData query;
	int i;
	bool first_group = true;

	if (lemma_is_bin == NULL)
	{
		MemoryContext oldctx = MemoryContextSwitchTo(TopMemoryContext);
		lemma_is_bin = lemma_is_load_binary(NULL);
		MemoryContextSwitchTo(oldctx);
	}

	initStringInfo(&query);
	tokens = icelandic_tokenize_words(txt, (int) strlen(txt), &token_count);
	token_data = (TokenCandidates *) palloc(sizeof(TokenCandidates) * token_count);

	for (i = 0; i < token_count; i++)
	{
		int candidate_count = 0;
		LemmaCandidate *candidates = lemma_is_get_candidates(lemma_is_bin, tokens[i].text, &candidate_count);
		token_data[i].token = tokens[i].text;
		token_data[i].candidates = candidates;
		token_data[i].count = candidate_count;
	}

	for (i = 0; i < token_count; i++)
	{
		int candidate_count = token_data[i].count;
		LemmaCandidate *candidates = token_data[i].candidates;
		char **token_lemmas = (char **) palloc(sizeof(char *) * candidate_count);
		int token_lemma_count = 0;
		const char *disambig_lemma = NULL;
		IcelandicPos disambig_pos = POS_NO;
		bool disambig_by_bigram = false;
		bool filter_disambiguated = false;
		int j;

		lemma_is_disambiguate_bigram(
			candidates,
			candidate_count,
			i > 0 ? token_data[i - 1].candidates : NULL,
			i > 0 ? token_data[i - 1].count : 0,
			i + 1 < token_count ? token_data[i + 1].candidates : NULL,
			i + 1 < token_count ? token_data[i + 1].count : 0,
			&disambig_lemma,
			&disambig_pos,
			NULL,
			&disambig_by_bigram);

		if (disambig_by_bigram && disambig_lemma)
			filter_disambiguated = lemma_is_contextual_stopword(disambig_lemma, disambig_pos);

		for (j = 0; j < candidate_count; j++)
		{
			const char *lemma = candidates[j].lemma;
			bool seen = false;
			int k;

			for (k = 0; k < token_lemma_count; k++)
			{
				if (strcmp(token_lemmas[k], lemma) == 0)
				{
					seen = true;
					break;
				}
			}

			if (seen)
				continue;

			if (filter_disambiguated && disambig_lemma && strcmp(lemma, disambig_lemma) == 0)
				continue;

			token_lemmas[token_lemma_count++] = candidates[j].lemma;
		}

		if (token_lemma_count == 0)
			continue;

		if (!first_group)
			appendStringInfoString(&query, " & ");
		first_group = false;

		if (token_lemma_count > 1)
			appendStringInfoChar(&query, '(');

		for (j = 0; j < token_lemma_count; j++)
		{
			if (j > 0)
				appendStringInfoString(&query, " | ");
			appendStringInfoString(&query, token_lemmas[j]);
		}

		if (token_lemma_count > 1)
			appendStringInfoChar(&query, ')');
	}

	PG_RETURN_TEXT_P(cstring_to_text(query.data));
}
