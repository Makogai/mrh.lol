# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
# Build-time only: Vite inlines VITE_* into the bundle and scripts/gen-data.mjs uses them to fetch projects.
# The anon/publishable key is public by design. In Coolify, mark both as "Build Variable".
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
