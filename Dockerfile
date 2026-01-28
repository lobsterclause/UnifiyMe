# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Install SSH, Expect, and Curl for diagnostics and health checks
RUN apk add --no-cache openssh-client expect curl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY *.exp ./

# Default command (can be overridden)
CMD ["node", "dist/index.js"]
