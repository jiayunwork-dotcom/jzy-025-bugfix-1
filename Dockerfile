FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 ships prebuilt binaries for linux x64/arm64, so no
# toolchain is needed in the image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "src/server.js"]
