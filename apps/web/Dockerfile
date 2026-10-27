# au1h admin portal (static SPA). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t au1h-web .
# Run with AU1H_SERVER_URL=https://api.example.com; it is written to /config.js at start.
FROM oven/bun:1.2 AS build
WORKDIR /repo
# Every workspace manifest the lockfile knows about must be present, or a
# frozen install fails. Keep this list in sync with the root `workspaces`.
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY examples/typescript/package.json examples/typescript/
RUN bun install --frozen-lockfile --filter web
COPY apps/web ./apps/web
RUN cd apps/web && bun run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.d-config.sh /docker-entrypoint.d/40-au1h-config.sh
EXPOSE 80
