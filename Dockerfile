# Tek sunucu: React build + FastAPI (port 8000)
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
# Frontend env vars passed from Dokploy Build-time Arguments
ARG REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
ARG REACT_APP_DID_API_KEY
ENV REACT_APP_DID_API_KEY=$REACT_APP_DID_API_KEY
ARG REACT_APP_DID_ENABLED
ENV REACT_APP_DID_ENABLED=$REACT_APP_DID_ENABLED

# Bos = ayni origin /api (tek sunucu)
ENV REACT_APP_BACKEND_URL=
RUN yarn build

FROM python:3.12-slim-bookworm
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements-deploy.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/build /app/frontend/build
ENV FRONTEND_BUILD_PATH=/app/frontend/build
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "ai_server:app", "--host", "0.0.0.0", "--port", "8000"]
