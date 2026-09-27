FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY renderer ./renderer
ENV NODE_ENV=production SIDEQUEST_RENDERER_MODE=container PORT=8789 MEDIA_DATA_DIR=/tmp/sidequest-media
USER node
EXPOSE 8789
CMD ["node", "renderer/server.mjs"]
