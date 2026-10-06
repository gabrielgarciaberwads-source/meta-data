FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY vite.config.js ./vite.config.js

RUN npm run build

FROM node:24-alpine

ENV NODE_ENV=production
ENV PORT=4178

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db.mjs ./src/db.mjs
COPY --from=build /app/src/dashboard-api.mjs ./src/dashboard-api.mjs
COPY --from=build /app/src/dashboard-queries.mjs ./src/dashboard-queries.mjs
COPY --from=build /app/src/server.mjs ./src/server.mjs

USER node

EXPOSE 4178

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4178/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
