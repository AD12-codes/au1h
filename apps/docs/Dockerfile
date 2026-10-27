# au1h docs (static export). Build from the repository root:
#   docker build -f apps/docs/Dockerfile -t au1h-docs .
# Next.js needs Node at build time (it does not run under Bun), so this stage
# uses a Node image with Bun installed only for the workspace install.
FROM node:22-alpine AS build
RUN npm install -g bun@1.2
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY examples/typescript/package.json examples/typescript/
RUN bun install --frozen-lockfile --filter docs
COPY apps/docs ./apps/docs
RUN cd apps/docs && npx next build

FROM nginx:1.27-alpine
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/out /usr/share/nginx/html
EXPOSE 80
