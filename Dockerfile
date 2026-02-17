FROM node:24-slim

WORKDIR /app

# billing-ui: pack as npm tarball then install as real package
COPY packages/billing-ui ./packages/billing-ui
RUN cd packages/billing-ui && npm pack --silent

# Install deps (strip billing-ui from package.json — installed via tarball below)
COPY web/package.json web/package-lock.json* ./
RUN sed -i '/"@nld\/billing-ui"/d' package.json
RUN npm install
RUN npm install packages/billing-ui/nld-billing-ui-*.tgz

# Copy source
COPY web/ .

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ENV GOOGLE_MAPS_API_KEY=build-placeholder

RUN npx next build

EXPOSE 3000
CMD ["npm", "start"]
