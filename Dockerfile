FROM node:24-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# billing-ui (shared package)
COPY packages/billing-ui /app/node_modules/@nld/billing-ui

# AlloResto web
COPY AlloResto/web/package.json AlloResto/web/package-lock.json* ./
RUN npm install

COPY AlloResto/web .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
