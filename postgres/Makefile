EXTENSION = icelandic_fts
MODULES = icelandic_fts
DATA = icelandic_fts--0.1.0.sql
DATA_built = icelandic_fts.core.bin
SHLIB_LINK += -lm

PG_CONFIG = pg_config
PGXS := $(shell $(PG_CONFIG) --pgxs)
include $(PGXS)

icelandic_fts.core.bin: ../data-dist/lemma-is.core.bin
	@cp ../data-dist/lemma-is.core.bin $@
