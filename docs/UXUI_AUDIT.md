# KTL CMI DRG Seeker — system and UX/UI audit

ตรวจล่าสุด: 2026-08-28 · ขอบเขต: SPA, API integration, Docker/nginx, GitHub Pages workflow และ responsive behavior

## ผลตรวจและการแก้ไข

| ประเด็น | ความเสี่ยง | ผลตรวจ |
|---|---:|---|
| SPA builder หา `package.json` / `index.html` ไม่พบ | สูง | แก้ด้วย Vite build ที่ root, lockfile และ workflow upload `dist/` |
| Docker เสิร์ฟ source โดยไม่มี build pipeline | สูง | แก้เป็น multi-stage Node/Vite + nginx runtime |
| Docker ไม่มี API route | สูง | เพิ่ม same-origin `/api/` reverse proxy ไป CMI@MoPH พร้อม SNI |
| Deep link โหลด asset เป็น HTML | สูง | เพิ่ม SPA fallback เฉพาะ document และให้ `/assets/*` 404 เมื่อหาไม่พบ |
| Public CORS proxy อาจรับข้อมูลเคส | สูง | ลบ fallback ออก; ใช้ direct official API หรือ Docker proxy เท่านั้น |
| Frontend ส่ง SDx เกิน API รองรับ | สูง | จำกัด SDx 10 และ Proc 20 ทั้ง UI และ payload |
| หยุด permutation ไม่ยกเลิก request ปัจจุบัน | กลาง | เพิ่ม AbortController และ abort เมื่อกดหยุด |
| History เดิมเก็บไม่ครบเคส | กลาง | เก็บ/restore HCode, เพศ, อายุ, น้ำหนัก, LOS, Base Rate, D/C, PDx, SDx, Proc |
| Validation เชื่อค่า input โดยตรง | กลาง | ตรวจ HCode 5 หลัก, ตรวจ PDx และ clamp numeric ranges ก่อนส่ง |
| Mobile viewport กว้างเกินจอ | กลาง | กำหนด `min-width: 0` / `minmax(0, ...)` กับ grid, form controls และ rows |
| ชื่อ DRG/คำอธิบายค้างที่ “กำลังโหลด” เมื่อ API ล้มเหลว | ต่ำ | แสดง fallback ที่บอกสถานะอย่างชัดเจน |
| GitHub Pages workflow อัปโหลด source ทั้ง repository | กลาง | build ด้วย Node แล้ว upload เฉพาะ `dist/` พร้อม base path ของ project |

## ข้อกำหนดที่ยืนยันจาก API

- Endpoint หลัก: `POST /drg/calculate`
- ICD-10: `GET /libs/icd10/{code}`
- ICD-9-CM: `GET /libs/icd-cm/{code}`
- D/C status: `GET /libs/ipd-result`
- API จำกัดการเข้าถึงตามตำแหน่งเครือข่าย จึงต้องใช้เครือข่ายในประเทศไทยหรือ VPN ของโรงพยาบาล
- API รองรับ SDx สูงสุด 10 และ Proc สูงสุด 20 ต่อเคส

## Test evidence

- `npm run build` ผ่านและสร้าง `dist/index.html` พร้อม hashed assets
- Playwright smoke tests ครอบคลุมคำนวณด้วย mocked API, restore history ทั้งเคส, deep link และ mobile width 375px
- Docker smoke test ครอบคลุม `/healthz`, `/`, deep link, MIME ของ assets และ 404 สำหรับ deep-link-relative asset ที่ไม่มีจริง
- API จริงทดสอบจากเครือข่ายที่อนุญาต: calculate ด้วย PDx `I639` ได้ DRG `01550`, RW `1.1574`, ADJRW `1.1574`

## ขอบเขตที่ตั้งใจคงไว้

- `gas-app/` เก็บเป็น legacy reference ไม่ถูกนำไป build หรือ deploy
- ประวัติและธีมเก็บใน browser `localStorage` เท่านั้น ไม่มีฐานข้อมูลหรือการ sync ระหว่างผู้ใช้
- Docker proxy ไม่ได้ bypass geo restriction ของ CMI@MoPH
