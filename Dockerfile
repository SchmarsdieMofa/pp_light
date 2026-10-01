FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations \
    UPLOAD_DIR=/data/uploads
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown app:app /data/uploads
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist/scripts ./scripts
COPY --from=build --chown=app:app /app/src/server/db/migrations ./migrations
# argon2 loads a platform-specific native binary that output tracing may miss
COPY --from=deps --chown=app:app /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
USER app
EXPOSE 3000
ENTRYPOINT ["sh", "./entrypoint.sh"]
