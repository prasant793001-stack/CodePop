# 1) build the web app from source (fonts come from npm), so a fresh GitHub clone deploys with no pre-built files
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY build/package.json build/package-lock.json build/
RUN cd build && npm ci --no-audit --no-fund
COPY build build
COPY src src
COPY shared shared
COPY public public
RUN cd build && node build.js

# 2) server dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app/server
# build tools are only a fallback in case no prebuilt SQLite binary is available for the platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3) runtime
FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app
COPY --from=deps /app/server/node_modules server/node_modules
COPY server server
COPY shared shared
COPY src src
COPY --from=web /app/dist/web dist/web
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
