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
- **Source of truth**: `https://github.com/planningktl-creator/DRGSeekerAPI.git` สาขา `main`

---

## ✨ ฟีเจอร์

- **คำนวณ DRG รายเคส** — กรอก PDx / SDx (สูงสุด 12) / หัตถการ / อายุ / น้ำหนัก / LOS / อัตราฐาน
- **ผลลัพธ์ครบถ้วน** — DRG, MDC, RW, ADJRW, WTLOS, OT, Error/Warning (เทียบกับ bridge ท้องถิ่น 1:1)
- **ค้นหา ICD-10 / ICD-9-CM** — อัตโนมัติจาก API libs พร้อมคำอธิบาย WHO
- **ชื่อ DRG / Error / Warning** — ใช้ `/libs/drg-name`, `/libs/drg-error`, `/libs/drg-warning`
- **ทดสอบหลายชุด SDx** — ถ้า SDx เกิน 12 ตัว จะทดสอบทุกชุดเพื่อดู RW ทุกรูปแบบ
- **ประวัติการคำนวณ** — ค่าเริ่มต้นเก็บในหน่วยความจำของแท็บ; ต้องเปิด “จำประวัติบนเครื่องนี้” ก่อนจึงจะเก็บใน `localStorage` (โหลดเคสกลับทั้ง PDx/SDx/Proc)
- **สลับธีม** — สว่าง/เข้ม เก็บค่าใน `localStorage`
- **การ์ดลัด (Quick)** — ชุดค่าตัวอย่างกดใช้เร็ว
- **Proxy fallback** — ถ้า fetch ตรงล้มชั่วคราว รายการค้นหา (GET `/libs/*`) จะลองผ่าน CORS proxy สาธารณะ — **ห้ามส่งข้อมูลเคสผู้ป่วย** (`/drg/calculate`) ผ่าน proxy เด็ดขาด

---

## 🏗️ สถาปัตยกรรม

```
เบราว์เซอร์ผู้ใช้ (web/index.html)
   │  fetch ตรง (หลัก)  ────────────►  https://had-api.moph.go.th/cmi
   │  fallback: CORS proxy สาธารณะ  ──►  (เมื่อ fetch ตรงล่มชั่วคราว)
   │
   └── โฮสต์บน GitHub Pages (static) — ไม่มี server-side, deploy อัตโนมัติผ่าน GitHub Actions
```

- **โฮสต์**: GitHub Pages (static hosting) — ไม่มี backend, ทำงานจากเบราว์เซอร์ล้วน
- **ตัวหลัก**: `fetch` ตรงไป API CMI@MoPH (CORS เปิด `*`)
- **fallback**: ลอง CORS proxy สาธารณะ (best-effort) เมื่อ fetch ตรงล่มชั่วคราว
- API จำกัดเฉพาะ **IP ไทย** (IP ต่างประเทศได้ 404)

### โครงสร้างไฟล์

```
index.html                   # raw-static builder entrypoint; redirect ไป web/
web/                         # canonical application source / artifact ของ Pages
├── index.html               # SPA หลัก (โครงสร้าง + markup)
├── .nojekyll                # ปิด Jekyll ของ Pages
└── assets/
    ├── styles.css           # Design System v3.0 (ธีมสว่าง/เข้ม, responsive)
    └── app.js               # Logic ทั้งหมด (fetch, autocomplete, permute, ประวัติ, ธีม)

scripts/check-static.mjs     # static preflight สำหรับ entrypoint และ asset references
tests/                       # Playwright regression suite แยกจาก root package

.github/workflows/deploy-pages.yml   # auto-deploy artifact จาก web/ ไป Pages
.github/workflows/web-ci.yml         # preflight + syntax/asset checks
gas-app/                             # (เก็บไว้เป็น reference จากเวอร์ชัน GAS เดิม — ไม่ได้ใช้งานแล้ว)
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
| GET | `/libs/ipd-result` | รายการสถานะจำหน่าย (D/C status) |

---

## 🚚 Deployment contract

### SPA Builder (raw static)

ตั้งค่า provider ให้ clone repository นี้แบบ fresh จาก `main` แล้ว publish **repository root (`.`) แบบ recursive** โดยเลือกโหมด raw static / no npm build:

- Repository: `https://github.com/planningktl-creator/DRGSeekerAPI.git`
- Branch: `main`
- Commit ขั้นต่ำที่ต้องเห็น: `a42769507c71bb7e92c7af9d4c53315f6bbbcb8d`
- Entrypoint: `index.html` ที่ root (ไฟล์นี้ redirect ไป `web/`)
- ห้ามเปลี่ยนเป็น Vite/npm build และห้าม deploy branch archive ที่มีโครงสร้างคนละแบบ

ถ้า builder แจ้งว่าไม่มี `package.json` และไม่มี `index.html` ให้ตรวจ clone source/branch/cache ก่อนแก้โค้ด เพราะโปรเจกต์นี้ตั้งใจไม่มี root `package.json` และมี root `index.html` อยู่แล้ว

### GitHub Pages

GitHub Actions อัปโหลดโฟลเดอร์ `web/` เป็น artifact ดังนั้น URL ที่ใช้งานคือ:

- `https://planningktl-creator.github.io/DRGSeekerAPI/`
- `https://planningktl-creator.github.io/DRGSeekerAPI/assets/app.js`

`/DRGSeekerAPI/web/` ไม่ใช่ Pages document root และตอบ 404 ได้ตามปกติ การตั้งค่า Pages ให้ใช้ **GitHub Actions** และ repository `planningktl-creator/DRGSeekerAPI` เป็นงาน provider/repository settings แยกจาก source code

Static preflight ที่ CI เรียกจะตรวจ root `index.html`, `web/index.html`, `web/.nojekyll` และ asset ทุกตัวที่ `web/index.html` อ้างถึง

---

## 🚀 Deploy (GitHub Pages)

**อัตโนมัติ** — ทุกครั้งที่ push ไฟล์ใน root entrypoint, `web/`, workflow หรือ static preflight (หรือกด `workflow_dispatch`) workflow
`.github/workflows/deploy-pages.yml` จะ build + deploy ขึ้น GitHub Pages ให้เอง ไม่ต้องรันอะไร

```bash
# แก้ไขโค้ดใน web/ หรือ deployment contract แล้ว push
git add index.html web/ scripts/ tests/ .github/workflows/ README.md .gitignore
git commit -m "fix: ..."
git push
```

- **URL**: https://planningktl-creator.github.io/DRGSeekerAPI/
- **ตั้งค่ามือครั้งเดียว**: Repo Settings → Pages → Source = "GitHub Actions" (ทำแล้ว)
- **Repo**: public (GitHub Pages ฟรีไม่รองรับ private repo)

### ตรวจสอบ/แก้ fallback proxy
`web/assets/app.js` → ค่าคงที่ `PROXY_FALLBACKS` (ตัวที่ใช้เมื่อ fetch ตรงล่มชั่วคราว)
fallback ใช้ได้เฉพาะ **GET `/libs/*`** เท่านั้น (ค้นหาชื่อยา/โรค/DRG) —
`apiRequest` บล็อกการส่ง `/drg/calculate` ผ่าน proxy เพื่อไม่ให้ข้อมูลเคสผู้ป่วยรั่วไหลไปบุคคลที่สาม
ตัวหลัก (fetch ตรง) ทำงานได้เสมอในไทย เพราะ CMI@MoPH เปิด CORS `*`

ไม่มีกรณีใดที่ `/drg/calculate` จะถูกส่งผ่าน public CORS proxy; fallback ถูกจำกัดไว้ที่ GET `/libs/*` เท่านั้น

---

## 🔐 Privacy และ validation

- HCode ต้องเป็นตัวเลข 5 หลัก; อายุ/อายุวัน/LOS เป็นจำนวนเต็มตามช่วง และน้ำหนัก/Base Rate ต้องเป็น finite number ตามช่วงที่กำหนด
- การคำนวณปกติส่ง SDx ได้ไม่เกิน 12 รายการ และ Proc ไม่เกิน 20 รายการ; ไม่มีการ clamp หรือตัดรายการเงียบ ๆ
- โหมดเปรียบเทียบรองรับ candidate รวม PDx/SDx สูงสุด 30 รายการ แต่ทุก request ยังคงส่ง SDx ไม่เกิน 12 รายการ
- ข้อมูลเคสและ recent codes ไม่ถูก persist โดย default; เมื่อ opt-in จะอยู่ใน localStorage ของ browser เครื่องนั้นเท่านั้น และไม่ควรเปิดใช้บนเครื่องสาธารณะ
- theme และ dictionary cache (`ktl_lib_*`) แยกจาก storage ข้อมูลเคส; การ opt-out จะล้าง `ktl_drg_hist` และ `ktl_drg_recent`

---

## 🧪 Test และ CI

root ไม่มี `package.json` เพื่อรักษา raw-static contract; Playwright ถูกแยกไว้ใน `tests/` สำหรับงานทดสอบเท่านั้น และใช้ mock/synthetic patient payload ไม่ใช้ข้อมูลผู้ป่วยจริง

```bash
node scripts/check-static.mjs
node --check web/assets/app.js
cd tests
npm install
npx playwright install chromium
npx playwright test
```

---

## 🛠️ หมายเหตุทางเทคนิค

- **Static hosting**: ทำงานจากเบราว์เซอร์ล้วน ไม่มี backend — เรียก CMI@MoPH ตรงผ่าน CORS
- **CORS proxy fallback**: safety net เฉพาะ GET `/libs/*` เมื่อ fetch ตรงล่มชั่วคราว — ไม่พึ่ง GAS server อีกต่อไป และไม่ส่งข้อมูลเคสผู้ป่วยผ่าน proxy
- **API เร็ว ~1.4 วินาที/เคส** (รัน EXE บนเซิร์ฟเวอร์ของ สรท.)
- **`gas-app/`**: โค้ดเวอร์ชัน GAS เดิมเก็บไว้เป็น reference เท่านั้น ไม่ได้ deploy แล้ว

---

## 📄 License

MIT License — ดูไฟล์ [LICENSE](LICENSE)
