# ---------- Stage 1: build Vue frontend (skipped automatically if client/ is empty) ----------
FROM node:24-slim AS client-build
WORKDIR /app/client
COPY frontend/ ./
RUN if [ -f package.json ]; then npm ci && npm run build; else mkdir -p dist; fi

# ---------- Stage 2: runtime = Node + Python + OR-Tools ----------
FROM node:24-slim
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY Backend/solver/requirements.txt solver/requirements.txt
RUN pip install --no-cache-dir -r solver/requirements.txt

COPY Backend/server/package*.json Backend/server/
RUN cd Backend/server && npm ci --omit=dev

COPY Backend/server/ Backend/server/
COPY Backend/solver/ Backend/solver/
COPY Backend/tools/ Backend/tools/
COPY --from=client-build /app/client/dist frontend/dist

ENV PORT=3000 PYTHON_BIN=/opt/venv/bin/python
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "Backend/server/index.js"]
