FROM oven/bun:1.3.14-alpine

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

RUN bun install --production && chown -R bun:bun /app && rm -rf .git

USER bun

CMD ["bun", "run", "--silent", "main"]
