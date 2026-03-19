FROM oven/bun:latest
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

RUN bun run build

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
