# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY App.tsx app.json babel.config.js metro.config.js tsconfig.json ./
COPY src ./src
ARG EXPO_PUBLIC_API_URL
ENV EXPO_NO_DOTENV=1
ENV EXPO_PUBLIC_ENABLE_PREVIEWS=false
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
RUN test -n "$EXPO_PUBLIC_API_URL" && npx expo export --platform web --output-dir /app/web-dist

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY deploy/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web-dist /usr/share/nginx/html
EXPOSE 8080
