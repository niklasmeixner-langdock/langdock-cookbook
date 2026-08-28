FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY static ./static
ENV HOST=0.0.0.0
EXPOSE 3333
CMD ["pnpm", "start"]
