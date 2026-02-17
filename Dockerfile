FROM node:24-slim

WORKDIR /app

# Install deps (strip billing-ui — resolved via alias, not npm)
COPY web/package.json web/package-lock.json* ./
RUN sed -i '/"@nld\/billing-ui"/d' package.json
RUN npm install

# Copy source
COPY web/ .

# billing-ui source AFTER web copy (copied into AlloResto/packages/ by prod.sh)
COPY packages/billing-ui ./packages/billing-ui

# Debug: verify billing-ui exists before build (remove after confirmed working)
RUN ls -la packages/billing-ui/src/index.ts

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ENV GOOGLE_MAPS_API_KEY=build-placeholder

RUN npx next build

EXPOSE 3000
CMD ["npm", "start"]
