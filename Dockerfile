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

# Place billing-ui in node_modules (resolved via turbopack.resolveAlias in next.config.js)
RUN mkdir -p node_modules/@nld && cp -r packages/billing-ui node_modules/@nld/billing-ui

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ENV GOOGLE_MAPS_API_KEY=build-placeholder

RUN npx next build --no-turbopack

EXPOSE 3000
CMD ["npm", "start"]
