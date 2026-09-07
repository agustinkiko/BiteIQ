# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f server/Dockerfile .
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS build
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
RUN npm run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S biteiq && adduser -S biteiq -G biteiq
COPY server/package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/migrations ./migrations
USER biteiq
EXPOSE 3000
CMD ["node", "dist/index.js"]
