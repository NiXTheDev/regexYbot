FROM oven/bun:1.3.5

ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

COPY . .

RUN chown -R bun:bun /app

USER bun

CMD ["bun", "run", "main"]