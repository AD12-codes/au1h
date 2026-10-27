# au1h server. Build from the repository root:
#   docker build -f apps/server/Dockerfile -t au1h-server .
FROM oven/bun:1.2 AS deps
WORKDIR /repo
# The lockfile covers every workspace, so install needs every manifest.
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
RUN bun install --frozen-lockfile --filter server

FROM oven/bun:1.2
WORKDIR /repo
ENV NODE_ENV=production PORT=4444
# Hoisted install: everything lives in the root node_modules.
COPY --from=deps /repo/node_modules ./node_modules
COPY apps/server ./apps/server
WORKDIR /repo/apps/server
EXPOSE 4444
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://127.0.0.1:4444/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies migrations, then starts. Bun runs the TypeScript sources directly.
USER bun
CMD ["bun", "run", "start"]
