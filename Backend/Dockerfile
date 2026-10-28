# ---------- Stage 1: build Vue frontend (skipped automatically if client/ is empty) ----------
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/ ./
RUN if [ -f package.json ]; then npm ci && npm run build; else mkdir -p dist; fi

# ---------- Stage 2: runtime = Node + Python + OR-Tools ----------
FROM node:20-slim
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY solver/requirements.txt solver/requirements.txt
RUN pip install --no-cache-dir -r solver/requirements.txt

COPY server/package*.json server/
RUN cd server && npm install --omit=dev

COPY server/ server/
COPY solver/ solver/
COPY tools/ tools/
COPY --from=client-build /app/client/dist client/dist

ENV PORT=3000 PYTHON_BIN=/opt/venv/bin/python
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
