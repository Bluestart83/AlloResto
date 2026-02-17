FROM node:24-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# AlloResto web — install deps (strip local workspace dep)
COPY AlloResto/web/package.json AlloResto/web/package-lock.json* ./
RUN sed -i '/"@nld\/billing-ui"/d' package.json
RUN npm install

# billing-ui (shared package — after npm install so it won't be overwritten)
COPY packages/billing-ui /app/node_modules/@nld/billing-ui

COPY AlloResto/web .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
