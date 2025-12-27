FROM oven/bun:1.3.5

ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

COPY . .

RUN groupadd -r -g 1001 bun && \
    useradd -r -u 1001 -g bun bun && \
    chown -R bun:bun /app

USER bun

CMD ["bun", "run", "main"]