FROM node:24-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# billing-ui (shared package — inside project root for Turbopack resolution)
COPY packages/billing-ui ./packages/billing-ui

# AlloResto web — install deps
COPY AlloResto/web/package.json AlloResto/web/package-lock.json* ./
RUN sed -i 's|"@nld/billing-ui": "[^"]*"|"@nld/billing-ui": "file:./packages/billing-ui"|' package.json
RUN npm install --install-links

COPY AlloResto/web .
RUN sed -i 's|"@nld/billing-ui": "[^"]*"|"@nld/billing-ui": "file:./packages/billing-ui"|' package.json

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ENV GOOGLE_MAPS_API_KEY=build-placeholder

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
