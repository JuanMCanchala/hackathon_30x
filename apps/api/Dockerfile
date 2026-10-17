# syntax=docker/dockerfile:1
# Recibido API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t recibido-api .

FROM node:24-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
# Manifests first, so dependencies are cached until one of them changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/dataset/package.json packages/dataset/
RUN pnpm install --frozen-lockfile --filter @recibido/api...
COPY packages packages
COPY apps/api apps/api
# The bundle carries the workspace packages, the migrations, the demo documents and the recorded
# model answers; deploy adds only the third-party runtime dependencies.
RUN pnpm --filter @recibido/api build \
  && pnpm --filter @recibido/api deploy --prod /out \
  && rm -rf /out/src /out/test /out/dist \
  && cp -r apps/api/dist /out/dist

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/index.js"]
