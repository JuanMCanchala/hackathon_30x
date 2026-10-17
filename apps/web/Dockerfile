# syntax=docker/dockerfile:1
# Mandato web. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:4000 -t mandato-web .

FROM node:24-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/dataset/package.json packages/dataset/
RUN pnpm install --frozen-lockfile --filter @mandato/web...
COPY packages/domain packages/domain
COPY apps/web apps/web
# Next.js resolves rewrites at build time, so the API's address is a build argument.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mandato/web build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
