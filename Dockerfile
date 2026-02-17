FROM node:24-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# billing-ui (shared package — copied first so npm can install it as file: dep)
COPY packages/billing-ui /tmp/billing-ui

# AlloResto web — install deps
COPY AlloResto/web/package.json AlloResto/web/package-lock.json* ./
RUN sed -i 's|"@nld/billing-ui": "[^"]*"|"@nld/billing-ui": "file:/tmp/billing-ui"|' package.json
RUN npm install

COPY AlloResto/web .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
