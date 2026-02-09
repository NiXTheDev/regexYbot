FROM oven/bun:1.3.9

ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --production

COPY . .

RUN chown -R bun:bun /app

USER bun

CMD ["bun", "run", "--silent", "main"]
