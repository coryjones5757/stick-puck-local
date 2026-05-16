# Production image: always includes a fresh `npm run build` output (dist/).
# On Railway: set the service builder to Dockerfile if Nixpacks ever skips the build step.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into dist/ at build time (Railway sometimes does not load .env.production).
ENV VITE_SITE_URL=https://saltypuck.com
ENV VITE_GA_MEASUREMENT_ID=G-8GTR4M4LN1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY lib/ ./lib/
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "server.mjs"]
