# syntax=docker/dockerfile:1
# Multi-stage build for the bundled sync server (ADR-0009).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
VOLUME ["/data"]
ENV VAULT_DIR=/data SYNC_TOKEN=changeme PORT=8080
CMD ["node", "dist/index.js"]
