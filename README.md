# KTL CMI DRG Seeker

> เครื่องมือคำนวณ DRG (Diagnosis Related Groups) ออนไลน์ — รพ.กันทรลักษ์
> ใช้ **Grouper ทางการ CMI@MoPH (TGrp6305 v6.3.5 / TDRG 6.3.4)** ผ่าน API สาธารณะ `had-api.moph.go.th`

Static Web App บน **GitHub Pages** สำหรับบุคลากรทางการแพทย์คำนวณ DRG รายเคสออนไลน์
โดยเรียก Grouper ทางการของกระทรวงสาธารณสุขตรงจากเบราว์เซอร์ ไม่ต้องมีเซิร์ฟเวอร์ส่วนตัว
โฮสต์ฟรีบน GitHub และเข้าถึงได้จากทุกที่ผ่านลิงก์

- **URL**: https://planningktl-creator.github.io/DRGSeekerAPI/
- **ภาษา UI**: ไทย
- **ธีม**: สว่าง/เข้ม (teal/cyan + amber แบรนด์ รพ.กันทรลักษ์)
- **ผู้พัฒนา**: งานยุทธศาสตร์ รพ.กันทรลักษ์ (10929)

---

## ✨ ฟีเจอร์

- **คำนวณ DRG รายเคส** — กรอก PDx / SDx (สูงสุด 12) / หัตถการ / อายุ / น้ำหนัก / LOS / อัตราฐาน
- **ผลลัพธ์ครบถ้วน** — DRG, MDC, RW, ADJRW, WTLOS, OT, Error/Warning (เทียบกับ bridge ท้องถิ่น 1:1)
- **ค้นหา ICD-10 / ICD-9-CM** — อัตโนมัติจาก API libs พร้อมคำอธิบาย WHO
- **ชื่อ DRG / Error / Warning** — ใช้ `/libs/drg-name`, `/libs/drg-error`, `/libs/drg-warning`
- **ทดสอบหลายชุด SDx** — ถ้า SDx เกิน 12 ตัว จะทดสอบทุกชุดเพื่อดู RW ทุกรูปแบบ
- **ประวัติการคำนวณ** — เก็บใน `localStorage` (โหลดเคสกลับทั้ง PDx/SDx/Proc)
- **สลับธีม** — สว่าง/เข้ม เก็บค่าใน `localStorage`
- **การ์ดลัด (Quick)** — ชุดค่าตัวอย่างกดใช้เร็ว
- **Proxy fallback** — ถ้า client fetch ติด CORS/geo จะส่งผ่าน GAS server (`UrlFetchApp`)

---

## 🏗️ สถาปัตยกรรม

```
เบราว์เซอร์ผู้ใช้ (index.html ที่ root)
   │  fetch ตรง (หลัก)  ────────────►  https://had-api.moph.go.th/cmi
   │  fallback: CORS proxy สาธารณะ  ──►  (เมื่อ fetch ตรงล่มชั่วคราว)
   │
   └── โฮสต์บน static hosting ใดก็ได้ (GitHub Pages / Netlify / Docker)
```

- **โฮสต์**: static hosting — ไม่มี backend, ทำงานจากเบราว์เซอร์ล้วน
- **ตัวหลัก**: `fetch` ตรงไป API CMI@MoPH (CORS เปิด `*`)
- **fallback**: ลอง CORS proxy สาธารณะ (best-effort) เมื่อ fetch ตรงล่มชั่วคราว
- API จำกัดเฉพาะ **IP ไทย** (IP ต่างประเทศได้ 404)

### โครงสร้างไฟล์

```
index.html                    # SPA หลัก (ที่ root เพื่อให้ static host ใด ๆ พร้อมใช้)
.nojekyll                     # ปิด Jekyll ของ GitHub Pages
assets/
├── styles.css                # Design System v3.0 (ธีมสว่าง/เข้ม, responsive)
└── app.js                    # Logic ทั้งหมด (fetch, autocomplete, permute, ประวัติ, ธีม)

Dockerfile, nginx.conf, docker-compose.yml   # self-host ผ่าน Docker
.github/workflows/deploy-pages.yml           # auto-deploy ไป GitHub Pages
gas-app/                       # (เก็บไว้เป็น reference จากเวอร์ชัน GAS เดิม — ไม่ได้ใช้งานแล้ว)
```

---

## 🔌 API ที่ใช้ (CMI@MoPH)

| Method | Path | ใช้ทำ |
|---|---|---|
| POST | `/drg/calculate` | คำนวณ DRG (หัวใจของระบบ) |
| GET | `/libs/icd10/{code}` | ข้อมูล ICD-10 + คำอธิบาย WHO |
| GET | `/libs/icd-cm/{code}` | ชื่อหัตถการ ICD-9-CM |
| GET | `/libs/drg-name/{drg}` | ตาราง DRG (rw0d, rw, wtlos, ot, mdf, drgname) |
| GET | `/libs/drg-error/{code}` | คำอธิบาย error code |
| GET | `/libs/drg-warning/{code}` | คำอธิบาย warning code (ภาษาไทย) |
| GET | `/libs/ipd-result` | รายการสถานะจำหน่าย 29 รายการ |

> เอกสารอ้างอิงฉบับเต็ม: `CMI_MOPH_DRG_API_Reference.md` (โฟลเดอร์ parent)

---

## 🚀 Deploy (GitHub Pages)

**อัตโนมัติ** — ทุกครั้งที่ push ไฟล์ `index.html` / `assets/` (หรือกด `workflow_dispatch`) workflow
`.github/workflows/deploy-pages.yml` จะ build + deploy ขึ้น GitHub Pages ให้เอง ไม่ต้องรันอะไร

```bash
# แก้ไขโค้ดแล้ว push — deploy ให้อัตโนมัติ
git add index.html assets/ && git commit -m "fix: ..." && git push
```

- **URL**: https://planningktl-creator.github.io/DRGSeekerAPI/
- **ตั้งค่ามือครั้งเดียว**: Repo Settings → Pages → Source = "GitHub Actions" (ทำแล้ว)
- **Repo**: public (GitHub Pages ฟรีไม่รองรับ private repo)

### ตรวจสอบ/แก้ fallback proxy
`assets/app.js` → ค่าคงที่ `PROXY_FALLBACKS` (ตัวที่ใช้เมื่อ fetch ตรงล่มชั่วคราว)
ตัวหลัก (fetch ตรง) ทำงานได้เสมอในไทย เพราะ CMI@MoPH เปิด CORS `*`

---

## 🐳 Docker (self-host / local dev)

รันแอปเป็น static site บน **nginx** (ไม่ต้องพึ่ง GitHub) — ใช้ได้ทั้ง local และ deploy บนเครื่อง/เซิร์ฟเวอร์เอง

**วิธีใช้ (docker compose):**
```bash
# build + run บน port 8080
docker compose up -d --build

# เปิด: http://localhost:8080
```

**หรือ docker run ตรง ๆ:**
```bash
docker build -t ktl-drg-seeker .
docker run -d -p 8080:80 --name ktl-drg-seeker ktl-drg-seeker
```

| ไฟล์ | ใช้ทำ |
|---|---|
| `Dockerfile` | nginx:alpine + คัดลอก `index.html`/`assets/` + healthcheck |
| `nginx.conf` | gzip, cache asset, security headers |
| `docker-compose.yml` | build + map port 8080→80, restart policy |
| `.dockerignore` | ยกเว้นไฟล์ไม่จำเป็นออกจาก image |

> ตัว app ยังเรียก CMI@MoPH ตรงจาก browser — container เป็นแค่ web server เสิร์ฟไฟล์ static

---

## 🛠️ หมายเหตุทางเทคนิค

- **Static hosting**: ทำงานจากเบราว์เซอร์ล้วน ไม่มี backend — เรียก CMI@MoPH ตรงผ่าน CORS
- **CORS proxy fallback**: เป็นแค่ safety net เมื่อ fetch ตรงล่มชั่วคราว (ตัวหลักในไทยทำงานได้เสมอ)
- **API เร็ว ~1.4 วินาที/เคส** (รัน EXE บนเซิร์ฟเวอร์ของ สรท.)
- **`gas-app/`**: โค้ดเวอร์ชัน GAS เดิมเก็บไว้เป็น reference เท่านั้น ไม่ได้ deploy แล้ว

---

## 📄 License

MIT License — ดูไฟล์ [LICENSE](LICENSE)
