# KTL CMI DRG Seeker

เครื่องมือคำนวณ DRG สำหรับงานยุทธศาสตร์ โรงพยาบาลกันทรลักษ์ ใช้ Grouper ทางการของ CMI@MoPH (TGrp6305 v6.3.5) เป็น SPA แบบ vanilla JavaScript ที่ build ด้วย Vite และ deploy ได้ทั้ง GitHub Pages กับ Docker

## ความสามารถ

- คำนวณ DRG รายเคสจาก PDx, SDx, Proc, HCode, เพศ, อายุ, น้ำหนัก, LOS และ D/C Status
- ค้นหา ICD-10 / ICD-9-CM, วางรหัสหลายรายการ และใช้ quick picks ได้
- SDx สูงสุด 10 รหัส และ Proc สูงสุด 20 รหัส ตามข้อจำกัดของ API จริง
- เปรียบเทียบทางเลือก PDx พร้อม progress, ETA, ปุ่มหยุด และยืนยันก่อนงานชุดใหญ่
- ประวัติการคำนวณเก็บใน `localStorage` และโหลดกลับได้ทั้งเคส
- ธีมสว่าง/เข้ม, keyboard shortcuts, accessible status และ responsive layout สำหรับมือถือ

## สถาปัตยกรรม

```text
GitHub Pages  ── browser fetch ──► https://had-api.moph.go.th/cmi

Docker/nginx  ── browser /api ──► nginx reverse proxy ──► CMI@MoPH API
                     │
                     └── SPA history fallback + static asset 404 safety
```

ไม่มี public CORS proxy อีกต่อไป เพื่อไม่ส่งข้อมูลเคสผ่านบริการภายนอกที่ควบคุมไม่ได้ Docker proxy ช่วยเรื่อง same-origin/CORS เท่านั้น และยังต้องใช้งานจากเครือข่ายในประเทศไทยหรือ VPN ของโรงพยาบาลตามข้อจำกัดของ API

## พัฒนาในเครื่อง

ต้องใช้ Node.js `>=20.19.0` (แนะนำ Node 22)

```bash
npm ci
npm run dev
```

เปิด `http://localhost:5173` จากนั้น Vite จะเรียก API ทางการโดยตรง ค่า API เปลี่ยนได้ด้วย `VITE_API_BASE` และ base path เปลี่ยนได้ด้วย `VITE_BASE_PATH`

คำสั่งสำคัญ:

```bash
npm run build       # สร้าง production artifact ที่ dist/
npm run preview     # เปิดดู dist/ แบบ local
npm test            # build + Playwright smoke tests
```

## Docker

Docker ใช้ multi-stage build: Node/Vite สร้าง `dist/` แล้ว nginx เสิร์ฟ artifact ที่ build เสร็จแล้ว พร้อม proxy `/api/` ไปยัง CMI@MoPH

```bash
docker compose up -d --build
```

เปิด `http://localhost:8080` ตรวจสุขภาพได้ที่ `http://localhost:8080/healthz`

ค่าที่ปรับได้:

```bash
# PowerShell
$env:PORT = "8088"
$env:VITE_API_BASE = "/api"
docker compose up -d --build
```

ถ้าต้องการ build image โดยตรง:

```bash
docker build -t ktl-drg-seeker .
docker run --rm -p 8080:80 ktl-drg-seeker
```

Nginx ตั้งค่า SPA fallback สำหรับ deep link เช่น `/cases/preview` แต่จะไม่ fallback path ที่อยู่ใต้ `/assets/` ดังนั้น asset ที่สะกดผิดจะได้ HTTP 404 และไม่ถูก browser ปฏิเสธด้วย MIME ผิดชนิด

## GitHub Pages

ไฟล์ `.github/workflows/deploy-pages.yml` จะติดตั้ง dependency ด้วย `npm ci`, build ด้วย:

- `VITE_BASE_PATH=/DRGSeekerAPI/`
- `VITE_API_BASE=https://had-api.moph.go.th/cmi`

แล้ว upload เฉพาะ `dist/` ไป GitHub Pages ทุกครั้งที่ push `main` หากระบบภายนอกยังแสดง error ว่าไม่มี `package.json` และ `index.html` ให้ตรวจว่า builder ใช้ branch `main` และ commit ล่าสุด ไม่ใช่ revision เก่าก่อนย้ายไฟล์จาก `web/` มา root

URL: <https://planningktl-creator.github.io/DRGSeekerAPI/>

## API ที่ใช้

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| POST | `/drg/calculate` | คำนวณ DRG |
| GET | `/libs/icd10/{code}` | ค้นหา ICD-10 |
| GET | `/libs/icd-cm/{code}` | ค้นหา ICD-9-CM |
| GET | `/libs/drg-name/{drg}` | ชื่อ DRG |
| GET | `/libs/drg-error/{code}` | คำอธิบาย error |
| GET | `/libs/drg-warning/{code}` | คำอธิบาย warning |
| GET | `/libs/ipd-result` | รายการ D/C Status |

เอกสารอ้างอิง API ฉบับเต็มอยู่ที่ `CMI_MOPH_DRG_API_Reference.md` ในโฟลเดอร์ parent ของ repository

## ตรวจสอบคุณภาพ

- `npm test` ตรวจ deep link, การคำนวณด้วย mocked API, การจำกัด payload และการ restore ประวัติทั้งเคส
- CI ตรวจ Node build, Playwright, Docker build, `/healthz`, root/deep link และยืนยันว่า `/deep/assets/app.js` เป็น 404
- การทดสอบ API จริงต้องทำจากเครือข่ายที่ API อนุญาต

## โครงสร้างสำคัญ

```text
index.html                         # SPA entry
assets/app.js                      # UI, API client, calculator flow
assets/styles.css                  # design system + responsive rules
vite.config.js                     # Vite SPA/base configuration
Dockerfile                         # Vite build + nginx runtime
nginx.conf                         # SPA fallback + /api proxy + headers
docker-compose.yml                 # local/self-host deployment
tests/spa.spec.js                  # Playwright smoke tests
gas-app/                           # GAS legacy reference; ไม่ได้ใช้ deploy
```

## License

MIT License — ดูไฟล์ [LICENSE](LICENSE)
