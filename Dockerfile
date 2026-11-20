FROM node:20-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils fonts-liberation fonts-dejavu-core \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Use npm install until both lockfiles are generated on a networked machine.
RUN npm install --no-audit --no-fund
COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY . .
RUN npm run openapi

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils fonts-liberation fonts-dejavu-core \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 python3 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /opt/venv /opt/venv
COPY . .
COPY --from=builder /app/public/openapi.json ./public/openapi.json
ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production
RUN mkdir -p /app/output /app/fixtures /app/public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["serve"]
