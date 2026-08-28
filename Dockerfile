# KTL CMI DRG Seeker — reproducible Vite build + nginx runtime

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE=/api
ARG VITE_BASE_PATH=/
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

LABEL org.opencontainers.image.title="KTL CMI DRG Seeker" \
      org.opencontainers.image.description="DRG calculator SPA using CMI@MoPH" \
      org.opencontainers.image.version="3.1.0" \
      org.opencontainers.image.source="https://github.com/planningktl-creator/DRGSeekerAPI"

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
