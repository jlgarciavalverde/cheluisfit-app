# syntax=docker/dockerfile:1
# La etapa de compilación corre en la arquitectura nativa del builder: pnpm 12 (Rust) falla bajo QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN npm i -g pnpm@12.4.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @cheluisfit/server...
COPY apps/server apps/server
ARG APP_VERSION=0.0.0
RUN pnpm --filter @cheluisfit/server build \
 && pnpm --filter @cheluisfit/server deploy --prod --legacy /out

FROM node:22-alpine
ARG APP_VERSION=0.0.0
ENV APP_VERSION=$APP_VERSION NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
# Solo la parte web del export de Expo — el APK y version.json no van en la imagen, los deja el
# despliegue directamente en el volumen de datos (cambian sin recompilar el servidor).
COPY apps/mobile/dist/index.html apps/mobile/dist/favicon.ico apps/mobile/dist/metadata.json ./web/
COPY apps/mobile/dist/_expo ./web/_expo
COPY apps/mobile/dist/assets ./web/assets
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
