FROM node:22.23.2-bookworm-slim AS dependencies
WORKDIR /app
# Prisma's engine needs OpenSSL; no local Node/npm install is required to build.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS backend
COPY backend/ backend/
COPY scripts/ scripts/
# Generation needs a syntactically valid URL, but never a real build credential.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate && npm run build --workspace backend
USER node
EXPOSE 3000
CMD ["node", "scripts/container-entrypoint.mjs", "backend"]

FROM dependencies AS frontend-build
COPY frontend/ frontend/
ARG VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace frontend

FROM nginx:1.30.5-alpine AS frontend
COPY infra/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /app/frontend/dist/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
