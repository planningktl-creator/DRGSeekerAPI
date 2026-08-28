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
web/                         # โฟลเดอร์ที่ deploy ขึ้น GitHub Pages
├── index.html               # SPA หลัก (โครงสร้าง + markup)
├── .nojekyll                # ปิด Jekyll ของ Pages
└── assets/
    ├── styles.css           # Design System v3.0 (ธีมสว่าง/เข้ม, responsive)
    └── app.js               # Logic ทั้งหมด (fetch, autocomplete, permute, ประวัติ, ธีม)

.github/workflows/deploy-pages.yml   # auto-deploy ไป Pages ทุกครั้งที่ push ไฟล์ใน web/
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
| GET | `/libs/ipd-result` | รายการสถานะจำหน่าย 29 รายการ |

> เอกสารอ้างอิงฉบับเต็ม: `CMI_MOPH_DRG_API_Reference.md` (โฟลเดอร์ parent)

---

## 🚀 Deploy (GitHub Pages)

**อัตโนมัติ** — ทุกครั้งที่ push ไฟล์ในโฟลเดอร์ `web/` (หรือกด `workflow_dispatch`) workflow
`.github/workflows/deploy-pages.yml` จะ build + deploy ขึ้น GitHub Pages ให้เอง ไม่ต้องรันอะไร

```bash
# แก้ไขโค้ดใน web/ แล้ว push — deploy ให้อัตโนมัติ
git add web/ && git commit -m "fix: ..." && git push
```

- **URL**: https://planningktl-creator.github.io/DRGSeekerAPI/
- **ตั้งค่ามือครั้งเดียว**: Repo Settings → Pages → Source = "GitHub Actions" (ทำแล้ว)
- **Repo**: public (GitHub Pages ฟรีไม่รองรับ private repo)

### ตรวจสอบ/แก้ fallback proxy
`web/assets/app.js` → ค่าคงที่ `PROXY_FALLBACKS` (ตัวที่ใช้เมื่อ fetch ตรงล่มชั่วคราว)
ตัวหลัก (fetch ตรง) ทำงานได้เสมอในไทย เพราะ CMI@MoPH เปิด CORS `*`

---

## 🛠️ หมายเหตุทางเทคนิค

- **Static hosting**: ทำงานจากเบราว์เซอร์ล้วน ไม่มี backend — เรียก CMI@MoPH ตรงผ่าน CORS
- **CORS proxy fallback**: เป็นแค่ safety net เมื่อ fetch ตรงล่มชั่วคราว (ตัวหลักในไทยทำงานได้เสมอ)
- **API เร็ว ~1.4 วินาที/เคส** (รัน EXE บนเซิร์ฟเวอร์ของ สรท.)
- **`gas-app/`**: โค้ดเวอร์ชัน GAS เดิมเก็บไว้เป็น reference เท่านั้น ไม่ได้ deploy แล้ว

---

## 📄 License

MIT License — ดูไฟล์ [LICENSE](LICENSE)
