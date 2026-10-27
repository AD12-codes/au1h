# au1h admin portal (static SPA). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_SERVER_URL=https://api.au1h.dev -t au1h-web .
FROM oven/bun:1.2 AS build
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY examples/typescript/package.json examples/typescript/
RUN bun install --frozen-lockfile --filter web
COPY apps/web ./apps/web
ARG VITE_SERVER_URL
ARG VITE_AU1H_ADMIN_APP_SLUG=au1h-admin
ENV VITE_SERVER_URL=$VITE_SERVER_URL VITE_AU1H_ADMIN_APP_SLUG=$VITE_AU1H_ADMIN_APP_SLUG
RUN cd apps/web && bun run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
