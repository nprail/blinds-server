# ── Stage 1: build the web UI ────────────────────────────────────────────────
FROM node:22-alpine AS ui-builder

WORKDIR /build

# Install only the dependencies needed for the build
COPY package*.json ./
COPY vite.config.js tailwind.config.js postcss.config.js ./
COPY ui/ ./ui/

RUN npm ci
RUN npm run build:ui

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:22-bookworm-slim

# Install Python 3 + build tools needed to compile RPi.GPIO
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        python3-dev \
        gcc \
        libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node.js production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python dependencies into an isolated venv so we never hit
# "externally managed environment" restrictions
RUN python3 -m venv /venv
COPY python/requirements.txt python/requirements.txt
RUN /venv/bin/pip install --no-cache-dir -r python/requirements.txt

# Copy application source and built UI
COPY src/ ./src/
COPY python/ ./python/
COPY config/ ./config/
COPY --from=ui-builder /build/public ./public/

# Tell rfService where to find Python
ENV PYTHON_PATH=/venv/bin/python3
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
