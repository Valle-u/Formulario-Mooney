# Imagen del Receipt Gate. Host "sacrificable": corre el parseo/sanitización de comprobantes
# (poppler, sharp/libvips, ClamAV) aislado del PAM. node:24 trae node:sqlite estable.

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# Capacidades del host para la Capa 1:
#  - poppler-utils → pdftoppm (rasteriza PDFs en sandbox)
#  - libheif1      → HEIC/HEIF (fotos de iPhone). sharp/libvips lo usa si está presente.
# ClamAV NO va acá: corre como sidecar (ver docker-compose.yml) y se apunta con CLAMD_HOST/PORT,
# así un eventual exploit del parser no comparte proceso con el antivirus.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils libheif1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# /data es el mountpoint del volumen (DB + receipts). Lo creamos con dueño `node` para que,
# al inicializar un volumen vacío, Docker preserve esa propiedad y el proceso (uid node) pueda
# escribir sin un `chown` manual en el host. Reproducible en test y prod.
RUN mkdir -p /data && chown -R node:node /data

# Usuario sin privilegios (defensa en profundidad).
USER node
EXPOSE 4100
CMD ["node", "dist/index.js"]
