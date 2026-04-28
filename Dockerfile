# syntax=docker/dockerfile:1

# NODE_ENV=production (muito comum em CI) faz o `npm ci` omitir devDependencies;
# sem @nestjs/cli o `nest build` falha com "nest: not found".
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY package.json ./
# STORAGE_DRIVER=local (padrão) grava em STORAGE_PATH relativo a cwd → /app/storage.
# O processo corre como USER node, que não pode mkdir em /app sem esta pasta acessível.
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "build/main.js"]
