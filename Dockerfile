# ============================================================
# KTL CMI DRG Seeker — Dockerfile (static web app)
# Serve โฟลเดอร์ web/ (GitHub Pages app) ผ่าน nginx
# ใช้ได้ทั้ง local dev และ production (deploy บนเครื่องใดก็ได้)
# ============================================================

# ---- Stage 1: builder (คัดลอกไฟล์ static เท่านั้น ไม่ต้อง build) ----
FROM nginx:1.27-alpine AS runtime

# ใส่ custom config (gzip, cache, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ไฟล์ static app
COPY web/ /usr/share/nginx/html/

# metadata
LABEL org.opencontainers.image.title="KTL CMI DRG Seeker" \
      org.opencontainers.image.description="DRG calculator static web app (CMI@MoPH)" \
      org.opencontainers.image.version="3.0" \
      org.opencontainers.image.source="https://github.com/planningktl-creator/DRGSeekerAPI"

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
