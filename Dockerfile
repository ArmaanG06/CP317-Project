# Stage 1: build the React app. The API lives on the same origin, under /api.
FROM node:22 AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=/api
RUN npm run build

# Stage 2: FastAPI serves the API and the built files.
FROM python:3.11-slim
WORKDIR /srv
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static
CMD ["sh", "-c", "uvicorn app.site:site --host 0.0.0.0 --port ${PORT:-10000}"]
