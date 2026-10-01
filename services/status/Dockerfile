# Coolify: second resource, Base Directory = services/status, port 3000, domain https://status.mrh.lol
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/healthz || exit 1
CMD ["node", "src/index.js"]
