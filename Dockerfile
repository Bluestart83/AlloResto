FROM node:24-slim

WORKDIR /app

# iagent-lib/billing: pack as npm tarball then install as real package
COPY packages/iagent-lib ./packages/iagent-lib
RUN cd packages/iagent-lib/packages/billing && npm pack --silent

# Install deps (strip @nld/billing from package.json — installed via tarball below)
COPY web/package.json web/package-lock.json* ./
RUN sed -i '/"@nld\/billing"/d' package.json
RUN npm install
RUN npm install packages/iagent-lib/packages/billing/nld-billing-*.tgz

# Copy source
COPY web/ .

# Dummy env for build only (real values injected at runtime via docker-compose env_file)
ARG GOOGLE_MAPS_API_KEY=build-placeholder
ENV GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY

RUN npx next build

EXPOSE 3000
CMD ["npm", "start"]
