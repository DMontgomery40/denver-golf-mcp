FROM node:20-slim

# Install Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY build/ ./build/

ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3000
ENV MCP_HTTP_HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="denver-golf-mcp" \
      org.opencontainers.image.description="MCP server for booking tee times at City of Denver golf courses" \
      org.opencontainers.image.version="2.1.0"

ENTRYPOINT ["node", "build/index.js"]
