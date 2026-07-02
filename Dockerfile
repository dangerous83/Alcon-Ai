# Container image for Alcon AI Studio — works on Railway, Fly.io, Cloud Run,
# Docker, or any container host.
FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

# The server persists jobs + mirrors media here. Mount a volume at /app/data
# on your host if you want generations to survive restarts.
VOLUME ["/app/data", "/app/uploads"]

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
