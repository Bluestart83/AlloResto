FROM node:24-slim

WORKDIR /app

# billing-ui source (copied into AlloResto/packages/ by prod.sh)
COPY packages/billing-ui ./packages/billing-ui

# Install deps (strip billing-ui — handled manually)
COPY web/package.json web/package-lock.json* ./
RUN sed -i '/"@nld\/billing-ui"/d' package.json
RUN npm install

# Copy source
COPY web/ .

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ENV GOOGLE_MAPS_API_KEY=build-placeholder

RUN npx next build --webpack

EXPOSE 3000
CMD ["npm", "start"]
