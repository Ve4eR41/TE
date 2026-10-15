# syntax=docker/dockerfile:1
FROM node:24.14.1-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@11.28.6
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/client/package.json ./packages/client/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN --network=none pnpm --filter @troll-vs-elves/server deploy --prod --offline /server-runtime

FROM node:24.14.1-bookworm-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 GAME_CONFIG_DIR=/app/config
WORKDIR /app
COPY --from=build --chown=node:node /server-runtime/ ./
COPY --from=build --chown=node:node /workspace/config/ ./config/
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

FROM nginxinc/nginx-unprivileged:1.28-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/packages/client/dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
