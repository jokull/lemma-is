FROM postgres:16

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential postgresql-server-dev-16 libicu-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
