FROM oven/bun:1.4.4-alpine

ARG VERSION
ARG COMMIT
ARG RELEASED_AT
ARG CHANGES
ENV VERSION=$VERSION
ENV COMMIT=$COMMIT
ENV RELEASED_AT=$RELEASED_AT
ENV CHANGES=$CHANGES

ENV NODE_ENV=production

WORKDIR /app

COPY . .

RUN bun install --production --frozen-lockfile && bun src/version.ts generate && chown -R bun:bun /app && rm -rf .git

USER bun

CMD ["bun", "run", "--silent", "main"]
